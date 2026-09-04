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
  type AttendeeWithStatus,
} from "@/lib/slack/meetings";
import type { MeetingBooking, User } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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

export interface CreateBookingInput {
  title: string;
  description?: string;
  meeting_date: string; // 'yyyy-MM-dd'
  start_time: string;   // 'HH:mm'
  end_time: string;     // 'HH:mm'
  attendee_ids: string[];
  notify_channel?: boolean;
  slack_channel?: string;
}

export async function createBooking(input: CreateBookingInput) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  const { title, description, meeting_date, start_time, end_time, attendee_ids } = input;
  const notify_channel = input.notify_channel ?? true;
  const slack_channel = input.slack_channel || DEFAULT_CHANNEL;

  if (!title.trim()) {
    return { error: "Meeting title is required" };
  }

  if (timeToMinutes(end_time) <= timeToMinutes(start_time)) {
    return { error: "End time must be after start time" };
  }

  // 1. Check for collisions on the same date
  const { data: existingBookings } = await supabase
    .from("meeting_room_bookings")
    .select("id, start_time, end_time, status, title")
    .eq("meeting_date", meeting_date)
    .in("status", ["scheduled", "in_progress"]);

  const collisionCheck = checkMeetingCollision(
    start_time,
    end_time,
    (existingBookings as any) || []
  );

  if (collisionCheck.hasConflict) {
    const conflicting = collisionCheck.conflictingMeeting;
    return {
      error: conflicting
        ? `The meeting room is already booked by "${conflicting.title}" from ${conflicting.start_time} to ${conflicting.end_time}.`
        : "The selected time slot overlaps with another meeting.",
    };
  }

  // 2. Insert booking
  const { data: newBooking, error: bookingErr } = await supabase
    .from("meeting_room_bookings")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      organizer_id: caller.id,
      meeting_date,
      start_time,
      end_time,
      status: "scheduled",
      notify_channel,
      slack_channel,
    })
    .select()
    .single();

  if (bookingErr || !newBooking) {
    return { error: bookingErr?.message || "Failed to create booking" };
  }

  // 3. Insert attendees (always ensure organizer is an attendee)
  const allAttendeeIds = Array.from(new Set([caller.id, ...attendee_ids]));
  if (allAttendeeIds.length > 0) {
    const attendeeRows = allAttendeeIds.map((userId) => ({
      booking_id: newBooking.id,
      user_id: userId,
    }));

    await supabase.from("meeting_attendees").insert(attendeeRows);

    // Create in-app notifications for attendees other than caller
    const notifyIds = allAttendeeIds.filter((id) => id !== caller.id);
    if (notifyIds.length > 0) {
      const notifRows = notifyIds.map((userId) => ({
        user_id: userId,
        type: "meeting_scheduled" as const,
        title: `Meeting Scheduled: ${title.trim()}`,
        body: `${meeting_date} from ${start_time} to ${end_time} by ${caller.name}`,
        data: { booking_id: newBooking.id, meeting_date, start_time, end_time },
      }));
      await supabase.from("notifications").insert(notifRows);
    }
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true, booking: newBooking };
}

export async function startMeetingAndNotify(bookingId: string) {
  const { error: authErr, caller, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr || !caller) return { error: authErr };

  // 1. Fetch booking with organizer and attendees
  const { data: booking, error: bErr } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("id", bookingId)
    .single();

  if (bErr || !booking) {
    return { error: "Booking not found" };
  }

  const { data: attendeesData } = await supabase
    .from("meeting_attendees")
    .select("*, user:users(*)")
    .eq("booking_id", bookingId);

  const attendees = (attendeesData || [])
    .map((a: any) => a.user as User)
    .filter(Boolean);

  // 2. Fetch leaves for attendee status detection on meeting_date
  const attendeeIds = attendees.map((a) => a.id);
  const { data: leaves } = await supabase
    .from("leaves")
    .select("user_id, leave_type, leave_date, duration, status")
    .in("user_id", attendeeIds)
    .eq("leave_date", booking.meeting_date)
    .eq("status", "approved");

  const attendeesWithStatus: AttendeeWithStatus[] = attendees.map((u) => ({
    user: u,
    status: resolveAttendeeStatus(u.id, booking.meeting_date, (leaves as any) || []),
  }));

  // 3. Mark booking as in_progress
  const now = new Date().toISOString();
  let messageTs: string | null = booking.slack_message_ts;

  // 4. Slack notifications
  const botToken = await getWorkspaceBotToken();
  if (botToken) {
    const channelName = booking.slack_channel || DEFAULT_CHANNEL;
    const organizerUser = booking.organizer || caller;

    // A. Channel broadcast if enabled
    if (booking.notify_channel) {
      const channelBlocks = buildMeetingStartBlockKit(
        booking,
        organizerUser,
        attendeesWithStatus,
        APP_URL
      );
      const postResult = await postChatMessage(
        botToken,
        channelName,
        `🚪 Meeting Starting Now: "${booking.title}" (${booking.start_time} - ${booking.end_time})`,
        channelBlocks
      );
      if (postResult.ok && postResult.ts) {
        messageTs = postResult.ts;
      }
    }

    // B. Tailored Direct Messages to attendees
    for (const item of attendeesWithStatus) {
      if (item.user.slack_user_id) {
        // Skip sending redundant DMs if on leave
        if (item.status === "on_leave") continue;

        const dmPayload = buildMeetingDM(booking, item.status, APP_URL);
        await postDirectMessage(
          botToken,
          item.user.slack_user_id,
          dmPayload.text,
          dmPayload.blocks
        );
      }
    }
  }

  // Update booking record
  await supabase
    .from("meeting_room_bookings")
    .update({
      status: "in_progress",
      started_at: now,
      slack_message_ts: messageTs,
    })
    .eq("id", bookingId);

  // 5. In-app notifications
  const notifyIds = attendeeIds.filter((id) => id !== caller.id);
  if (notifyIds.length > 0) {
    const notifs = notifyIds.map((userId) => ({
      user_id: userId,
      type: "meeting_starting" as const,
      title: `Meeting Starting Now: ${booking.title}`,
      body: `Started by ${caller.name} in the Meeting Room`,
      data: { booking_id: booking.id },
    }));
    await supabase.from("notifications").insert(notifs);
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true };
}

export async function endMeetingEarly(bookingId: string) {
  const { error: authErr, supabase } = await getAuthorizedLeaderOrHR();
  if (authErr) return { error: authErr };

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("meeting_room_bookings")
    .update({
      status: "completed",
      ended_at: now,
    })
    .eq("id", bookingId);

  if (updateErr) return { error: updateErr.message };

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

  const currentEndMin = timeToMinutes(booking.end_time);
  const newEndMin = currentEndMin + additionalMinutes;
  const newEndTime = minutesToTime(newEndMin);

  // Check collisions with subsequent bookings
  const { data: otherBookings } = await supabase
    .from("meeting_room_bookings")
    .select("id, start_time, end_time, status, title")
    .eq("meeting_date", booking.meeting_date)
    .neq("id", bookingId)
    .in("status", ["scheduled", "in_progress"]);

  const collision = checkMeetingCollision(
    booking.start_time,
    newEndTime,
    (otherBookings as any) || [],
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

  if (updateErr) return { error: updateErr.message };

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

  await supabase
    .from("meeting_room_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  // Broadcast cancellation to Slack channel if enabled
  const botToken = await getWorkspaceBotToken();
  if (botToken && booking.notify_channel) {
    const blocks = buildMeetingCancelledBlockKit(booking, caller.name, APP_URL);
    await postChatMessage(
      botToken,
      booking.slack_channel || DEFAULT_CHANNEL,
      `❌ Meeting Cancelled: "${booking.title}" by ${caller.name}`,
      blocks
    );
  }

  // In-app notifications to attendees
  const { data: attendees } = await supabase
    .from("meeting_attendees")
    .select("user_id")
    .eq("booking_id", bookingId);

  const notifyIds = (attendees || [])
    .map((a) => a.user_id)
    .filter((id) => id !== caller.id);

  if (notifyIds.length > 0) {
    await supabase.from("notifications").insert(
      notifyIds.map((uid) => ({
        user_id: uid,
        type: "meeting_cancelled" as const,
        title: `Meeting Cancelled: ${booking.title}`,
        body: `The meeting scheduled on ${booking.meeting_date} (${booking.start_time} - ${booking.end_time}) was cancelled by ${caller.name}.`,
        data: { booking_id: booking.id },
      }))
    );
  }

  revalidatePath("/meeting-room");
  revalidatePath("/calendar");
  return { success: true };
}
