import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeToMinutes } from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { getWorkspaceBotToken, postChatMessage, postDirectMessage } from "@/lib/slack/client";
import {
  buildMeetingStartBlockKit,
  buildMeetingDM,
  buildMeetingCancelledBlockKit,
  type AttendeeWithStatus,
} from "@/lib/slack/meetings";
import { resolveAttendeeStatus } from "@/lib/utils/meeting-conflicts";
import type { MeetingBooking, User } from "@/lib/types";

export const runtime = "nodejs";

// Server-only var — see APP_URL note in meeting-room/actions.ts.
const APP_URL = process.env.APP_URL || "http://localhost:3000";
if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
  console.error("APP_URL is not set — Slack meeting links will point at localhost.");
}
const DEFAULT_CHANNEL = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never fall back to "unauthenticated is fine"

  const authHeader = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type BookingRow = MeetingBooking & { organizer: User | null };

/**
 * Starts a single meeting: claims it, sends Slack traffic, records the
 * result. Returns true only when this call actually claimed and started the
 * booking (false when a manual click already claimed it first).
 */
async function startMeeting(
  supabase: ReturnType<typeof createAdminClient>,
  booking: BookingRow,
  attendeesWithStatus: AttendeeWithStatus[]
): Promise<boolean> {
  // Claim the booking before sending any Slack traffic. A guarded update means
  // this can only ever succeed once, even if a manual "Start & Notify Slack"
  // click races this same cron tick — the loser sends nothing.
  const { data: claimed } = await supabase
    .from("meeting_room_bookings")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "scheduled")
    .select("id")
    .single();

  if (!claimed) return false; // someone else (manual start) already claimed it

  const organizerUser = booking.organizer;
  const organizerName = organizerUser?.name || "the organizer";

  // Slack posting is best-effort and requires both a bot token and a
  // resolvable organizer — but the in-app notification below must still run
  // either way, otherwise a missing SLACK_BOT_TOKEN silently notifies no one.
  const botToken = await getWorkspaceBotToken();
  if (botToken && organizerUser) {
    const channelName = booking.slack_channel || DEFAULT_CHANNEL;

    if (booking.notify_channel) {
      const message = buildMeetingStartBlockKit(booking, organizerUser, attendeesWithStatus, APP_URL);
      const postResult = await postChatMessage(
        botToken,
        channelName,
        message.text,
        message.blocks,
        message.color
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
          const dmPayload = buildMeetingDM(booking, organizerUser, item.status, APP_URL);
          return postDirectMessage(
            botToken,
            item.user.slack_user_id as string,
            dmPayload.text,
            dmPayload.blocks,
            dmPayload.color
          );
        })
    );
  } else if (!organizerUser) {
    console.error(`Meeting ${booking.id} has no resolvable organizer; skipping Slack broadcast.`);
  }

  // Session-less admin-client context (no auth.uid()), so this inserts
  // directly rather than going through the create_notifications RPC — same
  // pattern as api/slack/shortcut/route.ts's Slack-booking notification, and
  // the same shape as the manual "Start & Notify Slack" button
  // (meeting-room/actions.ts's meeting_starting notification). Runs
  // regardless of whether Slack posting happened above.
  const notifyIds = attendeesWithStatus
    .map((item) => item.user.id)
    .filter((id) => id !== organizerUser?.id);
  if (notifyIds.length > 0) {
    try {
      const { error: notifError } = await supabase.from("notifications").insert(
        notifyIds.map((userId) => ({
          user_id: userId,
          type: "meeting_starting",
          title: `Meeting Starting Now: ${booking.title}`,
          body: `Organized by ${organizerName}, started automatically in the Meeting Room`,
          data: { booking_id: booking.id, meeting_date: booking.meeting_date },
        }))
      );
      if (notifError) {
        console.error(`Failed to notify attendees of auto-started meeting ${booking.id}:`, notifError.message);
      }
    } catch (e) {
      console.error(`Error notifying attendees of auto-started meeting ${booking.id}:`, e);
    }
  }

  return true;
}

/**
 * Cancels a single meeting that was never started and whose whole window has
 * elapsed — otherwise nothing ever touches it (pass 2 below only auto-starts
 * `scheduled` rows where `currentMinutes < endMin`, and pass 1 only
 * auto-completes rows already `in_progress`), so it would stay `scheduled`
 * forever, showing up as a phantom "upcoming" meeting on that date's
 * schedule indefinitely. Reuses `cancelled` status — no new status value.
 */
async function autoCancelAbandonedMeeting(
  supabase: ReturnType<typeof createAdminClient>,
  booking: BookingRow,
  attendees: User[]
): Promise<boolean> {
  // Claim before doing any Slack/notification work, so a race with a late
  // manual start or cancel can only ever resolve once — same pattern as
  // startMeeting above.
  const { data: claimed } = await supabase
    .from("meeting_room_bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id)
    .eq("status", "scheduled")
    .select("id")
    .single();

  if (!claimed) return false;

  const organizerUser = booking.organizer;
  const botToken = await getWorkspaceBotToken();

  if (botToken && organizerUser && booking.notify_channel) {
    const channelName = booking.slack_channel || DEFAULT_CHANNEL;
    const message = buildMeetingCancelledBlockKit(
      booking,
      organizerUser,
      "the system — meeting was never started",
      APP_URL
    );
    const result = await postChatMessage(botToken, channelName, message.text, message.blocks, message.color);
    if (!result.ok) {
      console.error(`Failed to post auto-cancellation for booking ${booking.id}:`, result.error);
    }
  }

  // Session-less admin-client context (no auth.uid()), so this inserts
  // directly rather than going through the create_notifications RPC — same
  // precedent as startMeeting's notification above.
  const notifyIds = attendees.map((u) => u.id);
  if (notifyIds.length > 0) {
    try {
      const { error: notifError } = await supabase.from("notifications").insert(
        notifyIds.map((userId) => ({
          user_id: userId,
          type: "meeting_cancelled",
          title: `Meeting Cancelled: ${booking.title}`,
          body: `Automatically cancelled — the meeting scheduled for ${booking.start_time}–${booking.end_time} was never started.`,
          data: { booking_id: booking.id, meeting_date: booking.meeting_date },
        }))
      );
      if (notifError) {
        console.error(`Failed to notify attendees of auto-cancelled meeting ${booking.id}:`, notifError.message);
      }
    } catch (e) {
      console.error(`Error notifying attendees of auto-cancelled meeting ${booking.id}:`, e);
    }
  }

  return true;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = officeDateString();
  const currentMinutes = officeMinutesOfDay();

  // ─── Pass 1: auto-complete meetings whose end_time has passed ───────────
  // Nothing else transitions in_progress -> completed, so without this a
  // meeting stays "in progress" forever and pins the room-status badge to
  // "Occupied" indefinitely.
  const { data: staleInProgress } = await supabase
    .from("meeting_room_bookings")
    .select("id, end_time, meeting_date")
    .lte("meeting_date", today)
    .eq("status", "in_progress");

  const toComplete = (staleInProgress || [])
    .filter((b) => b.meeting_date < today || currentMinutes >= timeToMinutes(b.end_time))
    .map((b) => b.id);

  if (toComplete.length > 0) {
    await supabase
      .from("meeting_room_bookings")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .in("id", toComplete)
      .eq("status", "in_progress");
  }

  // ─── Pass 2: start meetings whose start_time has arrived, or cancel ones
  // whose window closed before anyone ever started them ────────────────────
  const { data: bookings, error: bookingsErr } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .lte("meeting_date", today)
    .eq("status", "scheduled");

  if (bookingsErr) {
    console.error("Failed to load bookings for auto-start:", bookingsErr.message);
    return NextResponse.json({ ok: false, error: bookingsErr.message }, { status: 500 });
  }

  const scheduledBookings = (bookings as BookingRow[]) || [];

  const startingMeetings = scheduledBookings.filter((b) => {
    const startMin = timeToMinutes(b.start_time);
    const endMin = timeToMinutes(b.end_time);
    // Never auto-start a meeting left over from a past date — only today's
    // bookings can transition to in_progress here.
    return b.meeting_date === today && currentMinutes >= startMin && currentMinutes < endMin;
  });

  // A `scheduled` meeting whose end_time has already passed falls through
  // startingMeetings' `currentMinutes < endMin` check above and would
  // otherwise never be touched by either pass — this is that catch. Also
  // covers any booking left `scheduled` on a past date entirely.
  const abandonedMeetings = scheduledBookings.filter(
    (b) => b.meeting_date < today || currentMinutes >= timeToMinutes(b.end_time)
  );

  const startedIds: string[] = [];
  const cancelledIds: string[] = [];

  if (startingMeetings.length > 0 || abandonedMeetings.length > 0) {
    const bookingIds = [...startingMeetings, ...abandonedMeetings].map((b) => b.id);

    const { data: attendeesData } = await supabase
      .from("meeting_attendees")
      .select("booking_id, user:users(*)")
      .in("booking_id", bookingIds);

    const attendeesByBooking = new Map<string, User[]>();
    for (const row of (attendeesData || []) as unknown as { booking_id: string; user: User | null }[]) {
      if (!row.user) continue;
      const list = attendeesByBooking.get(row.booking_id) || [];
      list.push(row.user);
      attendeesByBooking.set(row.booking_id, list);
    }

    const allAttendeeIds = Array.from(
      new Set(Array.from(attendeesByBooking.values()).flat().map((u) => u.id))
    );

    const { data: leaves } =
      allAttendeeIds.length > 0
        ? await supabase
            .from("leaves")
            .select("user_id, leave_type, leave_date, duration, status")
            .in("user_id", allAttendeeIds)
            .eq("leave_date", today)
            .eq("status", "approved")
        : { data: [] as never[] };

    for (const booking of startingMeetings) {
      try {
        const attendees = attendeesByBooking.get(booking.id) || [];
        const attendeesWithStatus: AttendeeWithStatus[] = attendees.map((u) => ({
          user: u,
          status: resolveAttendeeStatus(u.id, today, leaves || [], booking.start_time),
        }));

        const started = await startMeeting(supabase, booking, attendeesWithStatus);
        if (started) startedIds.push(booking.id);
      } catch (e) {
        console.error(`Error auto-starting meeting ${booking.id}:`, e);
      }
    }

    for (const booking of abandonedMeetings) {
      try {
        const attendees = attendeesByBooking.get(booking.id) || [];
        const cancelled = await autoCancelAbandonedMeeting(supabase, booking, attendees);
        if (cancelled) cancelledIds.push(booking.id);
      } catch (e) {
        console.error(`Error auto-cancelling abandoned meeting ${booking.id}:`, e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    completed: toComplete.length,
    checked: startingMeetings.length,
    started: startedIds.length,
    startedIds,
    autoCancelled: cancelledIds.length,
    autoCancelledIds: cancelledIds,
  });
}
