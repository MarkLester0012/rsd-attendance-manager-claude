"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  checkMeetingCollision,
  timeToMinutes,
  minutesToTime,
  resolveAttendeeStatus,
} from "@/lib/utils/meeting-conflicts";
import {
  getWorkspaceBotToken,
  postChatMessage,
  postDirectMessage,
} from "@/lib/slack/client";
import {
  buildMeetingStartBlockKit,
  buildMeetingDM,
  buildMeetingCancelledBlockKit,
  buildAttendeeMessageDM,
  type AttendeeWithStatus,
} from "@/lib/slack/meetings";
import { createBookingCore, VALID_TIME, type CreateBookingCoreInput } from "@/lib/meetings/create-booking";
import type { User } from "@/lib/types";

// Server-only var (not NEXT_PUBLIC_): NEXT_PUBLIC_* vars are inlined into the
// bundle at build time, so if unset at build time every Slack button would
// permanently point at localhost regardless of the runtime environment.
// APP_URL is read at request time instead.
const APP_URL = process.env.APP_URL || "http://localhost:3000";
if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
  console.error("APP_URL is not set — Slack meeting links will point at localhost.");
}
const DEFAULT_CHANNEL = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";

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

/** Sends channel + per-attendee DM Slack notifications for a meeting starting now. */
async function sendMeetingStartSlack(
  booking: { id: string; title: string; description: string | null; organizer_id: string; meeting_date: string; start_time: string; end_time: string; status: string; notify_channel: boolean; slack_channel: string | null; slack_message_ts: string | null; started_at: string | null; ended_at: string | null; created_at: string; updated_at: string },
  organizer: User,
  attendeesWithStatus: AttendeeWithStatus[],
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const botToken = await getWorkspaceBotToken();
  if (!botToken) return;

  const channelName = booking.slack_channel || DEFAULT_CHANNEL;

  if (booking.notify_channel) {
    const blocks = buildMeetingStartBlockKit(booking as never, organizer, attendeesWithStatus, APP_URL);
    const postResult = await postChatMessage(
      botToken,
      channelName,
      `🚪 Meeting Starting Now: "${booking.title}" (${booking.start_time} - ${booking.end_time})`,
      blocks
    );
    if (postResult.ok && postResult.ts) {
      await supabase
        .from("meeting_room_bookings")
        .update({ slack_message_ts: postResult.ts })
        .eq("id", booking.id);
    } else if (!postResult.ok) {
      console.error(`Failed to post meeting-start message for booking ${booking.id}:`, postResult.error);
    }
  }

  await Promise.allSettled(
    attendeesWithStatus
      .filter((item) => item.user.slack_user_id)
      .map((item) => {
        const dmPayload = buildMeetingDM(booking as never, item.status, APP_URL);
        return postDirectMessage(botToken, item.user.slack_user_id as string, dmPayload.text, dmPayload.blocks);
      })
  );
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

  const coreInput: CreateBookingCoreInput = {
    title: input.title,
    description: input.description,
    meeting_date: input.meeting_date,
    start_time: input.start_time,
    end_time: input.end_time,
    attendee_ids: input.attendee_ids,
    notify_channel: input.notify_channel,
    slack_channel: input.slack_channel,
  };

  const result = await createBookingCore(supabase, caller.id, coreInput, DEFAULT_CHANNEL);
  if ("error" in result) return { error: result.error };

  const { booking: newBooking, attendeeIds } = result;

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

  const { data: existing } = await supabase
    .from("meeting_room_bookings")
    .select("id, meeting_date, status")
    .eq("id", bookingId)
    .single();
  if (!existing) return { error: "Booking not found" };
  if (existing.status === "cancelled" || existing.status === "completed") {
    return { error: `Cannot edit a ${existing.status} meeting` };
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
    (otherBookings as never) || [],
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

  const { error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({
      title,
      description: input.description?.trim() || null,
      start_time: input.start_time,
      end_time: input.end_time,
      notify_channel: input.notify_channel ?? true,
    })
    .eq("id", bookingId);

  if (updateErr) {
    if (updateErr.code === "23P01") {
      return { error: "The meeting room is already booked for an overlapping time slot." };
    }
    return { error: updateErr.message };
  }

  // Reconcile attendees: always keep the organizer.
  const desiredIds = Array.from(new Set([caller.id, ...input.attendee_ids]));
  const { data: currentAttendees } = await supabase
    .from("meeting_attendees")
    .select("user_id")
    .eq("booking_id", bookingId);
  const currentIds = (currentAttendees || []).map((a) => a.user_id);

  const toAdd = desiredIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !desiredIds.includes(id));

  if (toAdd.length > 0) {
    await supabase
      .from("meeting_attendees")
      .insert(toAdd.map((userId) => ({ booking_id: bookingId, user_id: userId })));
  }
  if (toRemove.length > 0) {
    await supabase
      .from("meeting_attendees")
      .delete()
      .eq("booking_id", bookingId)
      .in("user_id", toRemove);
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true };
}

export async function startMeetingAndNotify(bookingId: string) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

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
  const { data: leaves } = await supabase
    .from("leaves")
    .select("user_id, leave_type, leave_date, duration, status")
    .in("user_id", attendeeIds.length > 0 ? attendeeIds : [""])
    .eq("leave_date", claimed.meeting_date)
    .eq("status", "approved");

  const attendeesWithStatus: AttendeeWithStatus[] = attendees.map((u) => ({
    user: u,
    status: resolveAttendeeStatus(u.id, claimed.meeting_date, (leaves as never) || [], claimed.start_time),
  }));

  const organizerUser = (claimed.organizer as User) || caller;
  await sendMeetingStartSlack(claimed, organizerUser, attendeesWithStatus, supabase);

  const notifyIds = attendeeIds.filter((id) => id !== caller.id);
  if (notifyIds.length > 0) {
    const { error: notifError } = await supabase.rpc("create_notifications", {
      payload: notifyIds.map((userId) => ({
        user_id: userId,
        type: "meeting_starting" as const,
        title: `Meeting Starting Now: ${claimed.title}`,
        body: `Started by ${caller.name} in the Meeting Room`,
        data: { booking_id: claimed.id, meeting_date: claimed.meeting_date },
      })),
    });
    if (notifError) {
      console.error("Failed to notify attendees of meeting start:", notifError.message);
    }
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true };
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
  const { error: authErr, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr) return { error: authErr };

  const { data: booking, error: bErr } = await supabase
    .from("meeting_room_bookings")
    .select("*")
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
    (otherBookings as never) || [],
    bookingId
  );

  if (collision.hasConflict) {
    const nextMeeting = collision.conflictingMeeting;
    return {
      error: `Cannot extend by ${additionalMinutes}m: Meeting room is booked by "${nextMeeting?.title || "another meeting"}" at ${nextMeeting?.start_time}.`,
    };
  }

  const { error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({ end_time: newEndTime })
    .eq("id", bookingId);

  if (updateErr) {
    if (updateErr.code === "23P01") {
      return { error: "Cannot extend: the meeting room is booked for that time." };
    }
    return { error: updateErr.message };
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
    .select("*")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found" };
  if (booking.status === "cancelled") return { error: "This meeting is already cancelled." };
  if (booking.status === "completed") return { error: "Cannot cancel a completed meeting." };

  const { error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("status", booking.status); // guard against a concurrent state change
  if (updateErr) return { error: updateErr.message };

  const botToken = await getWorkspaceBotToken();
  if (botToken && booking.notify_channel) {
    const blocks = buildMeetingCancelledBlockKit(booking, caller.name, APP_URL);
    const result = await postChatMessage(
      botToken,
      booking.slack_channel || DEFAULT_CHANNEL,
      `❌ Meeting Cancelled: "${booking.title}" by ${caller.name}`,
      blocks
    );
    if (!result.ok) {
      console.error(`Failed to post cancellation for booking ${bookingId}:`, result.error);
    }
  }

  const { data: attendees } = await supabase
    .from("meeting_attendees")
    .select("user_id")
    .eq("booking_id", bookingId);

  const notifyIds = (attendees || [])
    .map((a) => a.user_id)
    .filter((id) => id !== caller.id);

  if (notifyIds.length > 0) {
    const { error: notifError } = await supabase.rpc("create_notifications", {
      payload: notifyIds.map((userId) => ({
        user_id: userId,
        type: "meeting_cancelled" as const,
        title: `Meeting Cancelled: ${booking.title}`,
        body: `The meeting scheduled on ${booking.meeting_date} (${booking.start_time} - ${booking.end_time}) was cancelled by ${caller.name}.`,
        data: { booking_id: booking.id, meeting_date: booking.meeting_date },
      })),
    });
    if (notifError) {
      console.error("Failed to notify attendees of cancellation:", notifError.message);
    }
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true };
}

export async function messageAttendees(bookingId: string, message: string) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  const trimmed = message.trim();
  if (!trimmed) return { error: "Message cannot be empty" };
  if (trimmed.length > 1000) return { error: "Message is too long (max 1000 characters)" };

  const { data: booking } = await supabase
    .from("meeting_room_bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) return { error: "Booking not found" };

  const { data: attendeesData } = await supabase
    .from("meeting_attendees")
    .select("*, user:users(*)")
    .eq("booking_id", bookingId);
  const attendees = (attendeesData || [])
    .map((a: { user: User | null }) => a.user)
    .filter((u): u is User => Boolean(u));

  const recipients = attendees.filter((u) => u.id !== caller.id);

  const botToken = await getWorkspaceBotToken();
  if (botToken) {
    const dmPayload = buildAttendeeMessageDM(booking, caller.name, trimmed, APP_URL);
    await Promise.allSettled(
      recipients
        .filter((u) => u.slack_user_id)
        .map((u) => postDirectMessage(botToken, u.slack_user_id as string, dmPayload.text, dmPayload.blocks))
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

  return { success: true, sentTo: recipients.length };
}
