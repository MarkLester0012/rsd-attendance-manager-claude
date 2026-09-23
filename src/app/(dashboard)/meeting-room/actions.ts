"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  checkMeetingCollision,
  timeToMinutes,
  minutesToTime,
  resolveAttendeeStatus,
  isBookingInThePast,
  isWithinStartWindow,
} from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { getWorkspaceBotToken, postChatMessage, postDirectMessage } from "@/lib/slack/client";
import {
  buildMeetingUpdatedBlockKit,
  buildMeetingCancelledBlockKit,
  buildAttendeeMessageDM,
  buildMeetingExtendedNoticeDM,
  type AttendeeWithStatus,
} from "@/lib/slack/meetings";
import { createBookingCore, VALID_TIME, type CreateBookingCoreInput } from "@/lib/meetings/create-booking";
import { notifyBookingCreated, postMeetingStartChannelMessage, sendMeetingStartDMs } from "@/lib/meetings/notify";
import { parseSlackChannel } from "@/lib/utils/slack-channel";
import { APP_URL, DEFAULT_CHANNEL } from "@/lib/meetings/config";
import type { User } from "@/lib/types";

async function getAuthorizedLeaderOrHR() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: "Not authenticated" as const, caller: null, supabase };
  }

  const { data: caller } = await supabase
    .from("users")
    .select("*, department:departments(*)")
    .eq("auth_id", authUser.id)
    .single();

  if (!caller || (caller.role !== "leader" && caller.role !== "hr")) {
    return {
      error: "Only leaders and HR can schedule or manage the meeting room" as const,
      caller: null,
      supabase,
    };
  }

  return { error: null, caller, supabase };
}

export interface CreateBookingInput {
  title: string;
  description?: string;
  meeting_date: string; // 'yyyy-MM-dd'
  start_time: string; // 'HH:mm'
  end_time: string; // 'HH:mm'
  attendee_ids: string[];
  notify_channel?: boolean;
  slack_channel?: string;
}

export async function createBooking(input: CreateBookingInput) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  // Validate here, not just in createBookingCore: this is the path with a
  // form field to show the rejection against.
  const parsedChannel = parseSlackChannel(input.slack_channel);
  if (!parsedChannel.ok) return { error: parsedChannel.error };

  const coreInput: CreateBookingCoreInput = {
    title: input.title,
    description: input.description,
    meeting_date: input.meeting_date,
    start_time: input.start_time,
    end_time: input.end_time,
    attendee_ids: input.attendee_ids,
    notify_channel: input.notify_channel,
    slack_channel: parsedChannel.value ?? undefined,
  };

  const result = await createBookingCore(supabase, caller.id, coreInput, DEFAULT_CHANNEL);
  if ("error" in result) return { error: result.error };

  const { booking: newBooking, attendeeIds } = result;

  // Per-attendee DMs and the in-app notification insert don't affect the
  // response the UI is waiting on (createBooking has no channel post, so
  // there's no slackWarning to compute synchronously) — deferred to after()
  // so the action resolves as soon as the booking itself is written.
  after(async () => {
    try {
      const notifyIds = attendeeIds.filter((id) => id !== caller.id);
      if (notifyIds.length > 0) {
        const { error: notifError } = await supabase.rpc("create_notifications", {
          payload: notifyIds.map((userId) => ({
            user_id: userId,
            type: "meeting_scheduled" as const,
            title: `Meeting Scheduled: ${newBooking.title}`,
            body: `${newBooking.meeting_date} from ${newBooking.start_time} to ${newBooking.end_time} by ${caller.name}`,
            data: { booking_id: newBooking.id, meeting_date: newBooking.meeting_date },
          })),
        });
        if (notifError) {
          console.error("Failed to notify attendees of new booking:", notifError.message);
        }
      }

      await notifyBookingCreated(supabase, newBooking, caller, attendeeIds, APP_URL);
    } catch (e) {
      console.error(`Error sending post-booking notifications for booking ${newBooking.id}:`, e);
    }
  });

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true, booking: newBooking };
}

export interface UpdateBookingInput {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  attendee_ids: string[];
  notify_channel?: boolean;
  slack_channel?: string;
}

export async function updateBooking(bookingId: string, input: UpdateBookingInput) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  const title = input.title.trim();
  if (!title) return { error: "Meeting title is required" };
  if (!VALID_TIME.test(input.start_time) || !VALID_TIME.test(input.end_time)) {
    return { error: "Invalid meeting time" };
  }
  if (timeToMinutes(input.end_time) <= timeToMinutes(input.start_time)) {
    return { error: "End time must be after start time" };
  }
  const parsedChannel = parseSlackChannel(input.slack_channel);
  if (!parsedChannel.ok) return { error: parsedChannel.error };

  const { data: existing } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("id", bookingId)
    .single();
  if (!existing) return { error: "Booking not found" };
  if (existing.status === "cancelled" || existing.status === "completed") {
    return { error: `Cannot edit a ${existing.status} meeting` };
  }
  if (caller.role !== "hr" && existing.organizer_id !== caller.id) {
    return { error: "Only the organizer or HR can edit this meeting." };
  }
  // The date field is locked in the edit modal, so this only ever matters for
  // a meeting scheduled today — the same past-time gap createBookingCore
  // guards against on create.
  if (isBookingInThePast(existing.meeting_date, input.start_time, officeDateString(), officeMinutesOfDay())) {
    return { error: "Cannot move this meeting to a time that has already passed." };
  }

  const { data: otherBookings } = await supabase
    .from("meeting_room_bookings")
    .select("id, start_time, end_time, status, title")
    .eq("meeting_date", existing.meeting_date)
    .neq("id", bookingId)
    .in("status", ["scheduled", "in_progress"]);

  const collision = checkMeetingCollision(
    input.start_time,
    input.end_time,
    otherBookings || [],
    bookingId
  );
  if (collision.hasConflict) {
    const conflicting = collision.conflictingMeeting;
    return {
      error: conflicting
        ? `The meeting room is already booked by "${conflicting.title}" from ${conflicting.start_time} to ${conflicting.end_time}.`
        : "The selected time slot overlaps with another meeting.",
    };
  }

  // A blank channel input means "leave it as-is", not "wipe it" — parsedChannel.value
  // is null both for blank input and for an explicit clear, and there is no
  // separate signal to distinguish them, so we always keep the existing value
  // rather than reset it to the env default.
  const nextChannel = parsedChannel.value ?? existing.slack_channel;

  // Reconcile attendees first (before the row update below): the row update
  // fires realtime, and meeting_attendees isn't itself in the realtime
  // publication, so reconciling after it would let another viewer's
  // refetchBookings briefly read the old attendee list with no later event
  // to correct it. Always keep the organizer.
  const desiredIds = Array.from(new Set([existing.organizer_id, ...input.attendee_ids]));
  const { data: currentAttendees, error: currentAttendeesErr } = await supabase
    .from("meeting_attendees")
    .select("user_id")
    .eq("booking_id", bookingId);
  if (currentAttendeesErr) {
    return { error: currentAttendeesErr.message };
  }
  const currentIds = (currentAttendees || []).map((a) => a.user_id);

  const toAdd = desiredIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !desiredIds.includes(id));

  if (toAdd.length > 0) {
    const { error: addErr } = await supabase
      .from("meeting_attendees")
      .insert(toAdd.map((userId) => ({ booking_id: bookingId, user_id: userId })));
    if (addErr) {
      return { error: `Failed to update attendees: ${addErr.message}` };
    }
  }
  if (toRemove.length > 0) {
    const { error: removeErr } = await supabase
      .from("meeting_attendees")
      .delete()
      .eq("booking_id", bookingId)
      .in("user_id", toRemove);
    if (removeErr) {
      // toAdd (if any) already committed above — undo it so a delete failure
      // doesn't leave attendees half-reconciled.
      if (toAdd.length > 0) {
        await supabase.from("meeting_attendees").delete().eq("booking_id", bookingId).in("user_id", toAdd);
      }
      return { error: `Failed to update attendees: ${removeErr.message}` };
    }
  }

  const { error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({
      title,
      description: input.description?.trim() || null,
      start_time: input.start_time,
      end_time: input.end_time,
      notify_channel: input.notify_channel ?? true,
      slack_channel: nextChannel,
    })
    .eq("id", bookingId);

  if (updateErr) {
    // Attendees were already reconciled above — undo that too, so a failed
    // row update (e.g. a concurrent overlap) doesn't leave attendees changed
    // while the booking itself reverts to its prior time/title.
    if (toAdd.length > 0) {
      await supabase.from("meeting_attendees").delete().eq("booking_id", bookingId).in("user_id", toAdd);
    }
    if (toRemove.length > 0) {
      await supabase
        .from("meeting_attendees")
        .insert(toRemove.map((userId) => ({ booking_id: bookingId, user_id: userId })));
    }
    if (updateErr.code === "23P01") {
      return { error: "The meeting room is already booked for an overlapping time slot." };
    }
    return { error: updateErr.message };
  }

  // Describe what changed, for the Slack notice and the in-app notification.
  const prevEffectiveChannel = existing.slack_channel || DEFAULT_CHANNEL;
  const effectiveChannel = nextChannel || DEFAULT_CHANNEL;

  const changes: string[] = [];
  if (existing.title !== title) {
    changes.push(`Title: "${existing.title}" -> "${title}"`);
  }
  if (existing.start_time !== input.start_time || existing.end_time !== input.end_time) {
    changes.push(`Time: ${existing.start_time} - ${existing.end_time} -> ${input.start_time} - ${input.end_time}`);
  }
  if (toAdd.length > 0 || toRemove.length > 0) {
    changes.push("Attendees updated");
  }
  if (prevEffectiveChannel !== effectiveChannel) {
    changes.push(`Slack channel: #${prevEffectiveChannel} -> #${effectiveChannel}`);
  }

  const organizer = (existing.organizer as User) || caller;
  const notifyChannel = input.notify_channel ?? true;
  let slackWarning: string | undefined;
  if (notifyChannel) {
    const botToken = await getWorkspaceBotToken();
    if (botToken) {
      // slack_channel: effectiveChannel so the card's own copy always matches
      // where it's actually posted — posting to the new channel (below) while
      // the builder still saw the old one would make the card's text lie.
      const updatedBooking = {
        ...existing,
        title,
        start_time: input.start_time,
        end_time: input.end_time,
        slack_channel: effectiveChannel,
      };
      const message = buildMeetingUpdatedBlockKit(updatedBooking, organizer, caller.name, changes, APP_URL);
      const result = await postChatMessage(
        botToken,
        effectiveChannel,
        message.text,
        message.blocks,
        message.color
      );
      if (!result.ok) {
        console.error(`Failed to post meeting-updated message for booking ${bookingId}:`, result.error);
        slackWarning = `Meeting saved, but the Slack post to #${effectiveChannel} failed: ${result.error ?? "unknown error"}`;
      }
    }
  }

  const notifyIds = desiredIds.filter((id) => id !== caller.id);
  if (notifyIds.length > 0) {
    const { error: notifError } = await supabase.rpc("create_notifications", {
      payload: notifyIds.map((userId) => ({
        user_id: userId,
        type: "meeting_scheduled" as const,
        title: `Meeting Updated: ${title}`,
        body: `${existing.meeting_date} from ${input.start_time} to ${input.end_time}, updated by ${caller.name}`,
        data: { booking_id: bookingId, meeting_date: existing.meeting_date },
      })),
    });
    if (notifError) {
      console.error("Failed to notify attendees of updated booking:", notifError.message);
    }
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true, slackWarning };
}

export async function startMeetingAndNotify(bookingId: string) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  const { data: bookingTime, error: bookingTimeErr } = await supabase
    .from("meeting_room_bookings")
    .select("meeting_date, start_time, end_time")
    .eq("id", bookingId)
    .single();
  if (bookingTimeErr || !bookingTime) return { error: "Booking not found" };

  if (
    !isWithinStartWindow(
      bookingTime.meeting_date,
      bookingTime.start_time,
      bookingTime.end_time,
      officeDateString(),
      officeMinutesOfDay()
    )
  ) {
    return {
      error: "This meeting can only be started from 15 minutes before its start time until it ends.",
    };
  }

  // Claim the booking before doing any Slack work, so a manual click racing
  // the auto-start cron can only ever win once — the loser gets no row back
  // and sends nothing.
  const { data: claimed, error: claimErr } = await supabase
    .from("meeting_room_bookings")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "scheduled")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .single();

  if (claimErr || !claimed) {
    return { error: "This meeting is not currently scheduled (it may have already started or been cancelled)." };
  }

  const { data: attendeesData } = await supabase
    .from("meeting_attendees")
    .select("*, user:users(*)")
    .eq("booking_id", bookingId);

  const attendees = (attendeesData || [])
    .map((a: { user: User | null }) => a.user)
    .filter((u): u is User => Boolean(u));

  const attendeeIds = attendees.map((a) => a.id);
  const { data: leaves } =
    attendeeIds.length > 0
      ? await supabase
          .from("leaves")
          .select("user_id, leave_type, leave_date, duration, status")
          .in("user_id", attendeeIds)
          .eq("leave_date", claimed.meeting_date)
          .eq("status", "approved")
      : { data: [] as never[] };

  const attendeesWithStatus: AttendeeWithStatus[] = attendees.map((u) => ({
    user: u,
    status: resolveAttendeeStatus(u.id, claimed.meeting_date, leaves || [], claimed.start_time),
  }));

  const organizerUser = (claimed.organizer as User) || caller;

  // Only the channel post is awaited synchronously — its failure produces
  // the slackWarning toast the UI surfaces. Per-attendee DMs and the in-app
  // notification insert don't affect that response, so they're deferred to
  // after().
  const botToken = await getWorkspaceBotToken();
  const slackWarning = botToken
    ? await postMeetingStartChannelMessage(supabase, claimed, organizerUser, attendeesWithStatus, APP_URL, botToken)
    : undefined;

  const startedByNote =
    caller.id === organizerUser.id ? `Organized by ${organizerUser.name}` : `Organized by ${organizerUser.name}, started by ${caller.name}`;

  const notifyIds = attendeeIds.filter((id) => id !== caller.id);

  after(async () => {
    try {
      if (botToken) {
        await sendMeetingStartDMs(botToken, claimed, organizerUser, attendeesWithStatus, APP_URL);
      }
      if (notifyIds.length > 0) {
        const { error: notifError } = await supabase.rpc("create_notifications", {
          payload: notifyIds.map((userId) => ({
            user_id: userId,
            type: "meeting_starting" as const,
            title: `Meeting Starting Now: ${claimed.title}`,
            body: `${startedByNote} in the Meeting Room`,
            data: { booking_id: claimed.id, meeting_date: claimed.meeting_date },
          })),
        });
        if (notifError) {
          console.error("Failed to notify attendees of meeting start:", notifError.message);
        }
      }
    } catch (e) {
      console.error(`Error sending post-start notifications for booking ${claimed.id}:`, e);
    }
  });

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true, slackWarning };
}

export async function endMeetingEarly(bookingId: string) {
  const { error: authErr, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr) return { error: authErr };

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({ status: "completed", ended_at: now })
    .eq("id", bookingId)
    .eq("status", "in_progress")
    .select("id")
    .single();

  if (updateErr || !updated) {
    return { error: "This meeting is not currently in progress." };
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true };
}

export async function extendMeeting(bookingId: string, additionalMinutes: number = 15) {
  if (additionalMinutes !== 15 && additionalMinutes !== 30) {
    return { error: "Meetings can only be extended by 15 or 30 minutes." };
  }

  const { error: authErr, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr) return { error: authErr };

  const { data: booking, error: bErr } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("id", bookingId)
    .single();

  if (bErr || !booking) return { error: "Booking not found" };
  if (booking.status !== "scheduled" && booking.status !== "in_progress") {
    return { error: `Cannot extend a ${booking.status} meeting` };
  }

  const currentEndMin = timeToMinutes(booking.end_time);
  const newEndMin = currentEndMin + additionalMinutes;
  if (newEndMin > 1439) {
    return { error: "Cannot extend past midnight." };
  }
  const newEndTime = minutesToTime(newEndMin);

  const { data: otherBookings } = await supabase
    .from("meeting_room_bookings")
    .select("id, start_time, end_time, status, title")
    .eq("meeting_date", booking.meeting_date)
    .neq("id", bookingId)
    .in("status", ["scheduled", "in_progress"]);

  const collision = checkMeetingCollision(
    booking.start_time,
    newEndTime,
    otherBookings || [],
    bookingId
  );

  if (collision.hasConflict) {
    const nextMeeting = collision.conflictingMeeting;
    return {
      error: `Cannot extend by ${additionalMinutes}m: Meeting room is booked by "${nextMeeting?.title || "another meeting"}" at ${nextMeeting?.start_time}.`,
    };
  }

  const { data: updatedRow, error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({ end_time: newEndTime, was_extended: true })
    .eq("id", bookingId)
    .in("status", ["scheduled", "in_progress"])
    .select("id")
    .single();

  if (updateErr) {
    if (updateErr.code === "23P01") {
      return { error: "Cannot extend: the meeting room is booked for that time." };
    }
    return { error: updateErr.message };
  }
  if (!updatedRow) {
    return { error: "This meeting was already updated by someone else." };
  }

  // Courtesy heads-up to the organizer of the immediately-next meeting that
  // day (the one whose start_time is closest after this one, among those
  // with a different organizer) — only their buffer actually shrinks.
  // checkMeetingCollision above already guarantees this extension can never
  // overlap their booking, so this is purely informational — gated on
  // notify_channel like every other Slack touchpoint for this booking.
  if (booking.notify_channel) {
    const { data: laterBookings } = await supabase
      .from("meeting_room_bookings")
      .select("organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
      .eq("meeting_date", booking.meeting_date)
      .neq("id", bookingId)
      .neq("organizer_id", booking.organizer_id)
      .in("status", ["scheduled", "in_progress"])
      .gt("start_time", booking.start_time)
      .order("start_time", { ascending: true })
      .limit(1);

    const seenOrganizerIds = new Set<string>();
    const recipients: User[] = [];
    for (const row of (laterBookings as unknown as { organizer: User | null }[]) || []) {
      if (row.organizer && !seenOrganizerIds.has(row.organizer.id)) {
        seenOrganizerIds.add(row.organizer.id);
        recipients.push(row.organizer);
      }
    }

    if (recipients.length > 0) {
      const extendedBooking = { ...booking, end_time: newEndTime };
      const organizer = (booking.organizer as User) || null;

      if (organizer) {
        const botToken = await getWorkspaceBotToken();
        if (botToken) {
          const message = buildMeetingExtendedNoticeDM(extendedBooking, organizer, APP_URL);
          await Promise.allSettled(
            recipients
              .filter((u) => u.slack_user_id)
              .map((u) =>
                postDirectMessage(botToken, u.slack_user_id as string, message.text, message.blocks, message.color)
              )
          );
        }
      }

      const { error: notifError } = await supabase.rpc("create_notifications", {
        payload: recipients.map((u) => ({
          user_id: u.id,
          type: "meeting_extended" as const,
          title: `Meeting Room: "${booking.title}" extended`,
          body: `Extended to ${newEndTime}. Your meeting today is unaffected.`,
          data: { booking_id: bookingId, meeting_date: booking.meeting_date },
        })),
      });
      if (notifError) {
        console.error("Failed to notify other organizers of meeting extension:", notifError.message);
      }
    }
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true, newEndTime };
}

export async function cancelBooking(bookingId: string) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  const { data: booking } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found" };
  if (booking.status === "cancelled") return { error: "This meeting is already cancelled." };
  if (booking.status === "completed") return { error: "Cannot cancel a completed meeting." };
  if (caller.role !== "hr" && booking.organizer_id !== caller.id) {
    return { error: "Only the organizer or HR can cancel this meeting." };
  }

  const { data: cancelledRow, error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("status", booking.status) // guard against a concurrent state change
    .select("id")
    .single();
  if (updateErr || !cancelledRow) {
    return { error: "This meeting was already updated by someone else." };
  }

  const organizer = (booking.organizer as User) || caller;

  let slackWarning: string | undefined;
  const botToken = await getWorkspaceBotToken();
  if (botToken && booking.notify_channel) {
    const cancelChannel = booking.slack_channel || DEFAULT_CHANNEL;
    const message = buildMeetingCancelledBlockKit(booking, organizer, caller.name, APP_URL);
    const result = await postChatMessage(
      botToken,
      cancelChannel,
      message.text,
      message.blocks,
      message.color
    );
    if (!result.ok) {
      console.error(`Failed to post cancellation for booking ${bookingId}:`, result.error);
      slackWarning = `Meeting cancelled, but the Slack post to #${cancelChannel} failed: ${result.error ?? "unknown error"}`;
    }
  }

  const { data: attendees } = await supabase
    .from("meeting_attendees")
    .select("user_id")
    .eq("booking_id", bookingId);

  const notifyIds = (attendees || [])
    .map((a) => a.user_id)
    .filter((id) => id !== caller.id);

  const cancelledByNote =
    caller.id === organizer.id ? `by ${organizer.name}` : `by ${caller.name} (organized by ${organizer.name})`;

  // In-app notification insert doesn't affect the response (the channel post
  // above already produced slackWarning) — deferred to after().
  after(async () => {
    try {
      if (notifyIds.length > 0) {
        const { error: notifError } = await supabase.rpc("create_notifications", {
          payload: notifyIds.map((userId) => ({
            user_id: userId,
            type: "meeting_cancelled" as const,
            title: `Meeting Cancelled: ${booking.title}`,
            body: `The meeting scheduled on ${booking.meeting_date} (${booking.start_time} - ${booking.end_time}) was cancelled ${cancelledByNote}.`,
            data: { booking_id: booking.id, meeting_date: booking.meeting_date },
          })),
        });
        if (notifError) {
          console.error("Failed to notify attendees of cancellation:", notifError.message);
        }
      }
    } catch (e) {
      console.error(`Error notifying attendees of cancellation for booking ${booking.id}:`, e);
    }
  });

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true, slackWarning };
}

export async function messageAttendees(bookingId: string, message: string) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  const trimmed = message.trim();
  if (!trimmed) return { error: "Message cannot be empty" };
  if (trimmed.length > 1000) return { error: "Message is too long (max 1000 characters)" };

  const { data: booking } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("id", bookingId)
    .single();
  if (!booking) return { error: "Booking not found" };

  const organizer = (booking.organizer as User) || caller;

  const { data: attendeesData } = await supabase
    .from("meeting_attendees")
    .select("*, user:users(*)")
    .eq("booking_id", bookingId);
  const attendees = (attendeesData || [])
    .map((a: { user: User | null }) => a.user)
    .filter((u): u is User => Boolean(u));

  const recipients = attendees.filter((u) => u.id !== caller.id);
  // sentTo is computed synchronously above (from the already-fetched
  // attendee list) so the response isn't waiting on any Slack call — the DM
  // send and the in-app notification insert are both deferred to after().
  const sentTo = recipients.length;

  after(async () => {
    try {
      const botToken = await getWorkspaceBotToken();
      if (botToken) {
        const dmPayload = buildAttendeeMessageDM(booking, organizer, caller.name, trimmed, APP_URL);
        await Promise.allSettled(
          recipients
            .filter((u) => u.slack_user_id)
            .map((u) =>
              postDirectMessage(botToken, u.slack_user_id as string, dmPayload.text, dmPayload.blocks, dmPayload.color)
            )
        );
      }

      if (recipients.length > 0) {
        const { error: notifError } = await supabase.rpc("create_notifications", {
          payload: recipients.map((u) => ({
            user_id: u.id,
            type: "meeting_message" as const,
            title: `Message about: ${booking.title}`,
            body: `${caller.name}: ${trimmed.slice(0, 200)}`,
            data: { booking_id: booking.id, meeting_date: booking.meeting_date },
          })),
        });
        if (notifError) {
          console.error("Failed to notify attendees of message:", notifError.message);
        }
      }
    } catch (e) {
      console.error(`Error sending message notifications for booking ${booking.id}:`, e);
    }
  });

  return { success: true, sentTo };
}
