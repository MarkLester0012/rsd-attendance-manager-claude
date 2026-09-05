import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeToMinutes } from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { getWorkspaceBotToken, postChatMessage, postDirectMessage } from "@/lib/slack/client";
import { buildMeetingStartBlockKit, buildMeetingDM, type AttendeeWithStatus } from "@/lib/slack/meetings";
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

/** Starts a single meeting: claims it, sends Slack traffic, records the result. */
async function startMeeting(
  supabase: ReturnType<typeof createAdminClient>,
  booking: BookingRow,
  attendeesWithStatus: AttendeeWithStatus[]
): Promise<void> {
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

  if (!claimed) return; // someone else (manual start) already claimed it

  const botToken = await getWorkspaceBotToken();
  if (!botToken) return;

  const organizerUser = booking.organizer;
  if (!organizerUser) {
    console.error(`Meeting ${booking.id} has no resolvable organizer; skipping Slack broadcast.`);
    return;
  }

  const channelName = booking.slack_channel || DEFAULT_CHANNEL;

  if (booking.notify_channel) {
    const blocks = buildMeetingStartBlockKit(booking, organizerUser, attendeesWithStatus, APP_URL);
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
        const dmPayload = buildMeetingDM(booking, item.status, APP_URL);
        return postDirectMessage(botToken, item.user.slack_user_id as string, dmPayload.text, dmPayload.blocks);
      })
  );
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
    .select("id, end_time")
    .eq("meeting_date", today)
    .eq("status", "in_progress");

  const toComplete = (staleInProgress || [])
    .filter((b) => currentMinutes >= timeToMinutes(b.end_time))
    .map((b) => b.id);

  if (toComplete.length > 0) {
    await supabase
      .from("meeting_room_bookings")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .in("id", toComplete)
      .eq("status", "in_progress");
  }

  // ─── Pass 2: start meetings whose start_time has arrived ────────────────
  const { data: bookings, error: bookingsErr } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("meeting_date", today)
    .eq("status", "scheduled");

  if (bookingsErr) {
    console.error("Failed to load bookings for auto-start:", bookingsErr.message);
    return NextResponse.json({ ok: false, error: bookingsErr.message }, { status: 500 });
  }

  const startingMeetings = ((bookings as BookingRow[]) || []).filter((b) => {
    const startMin = timeToMinutes(b.start_time);
    const endMin = timeToMinutes(b.end_time);
    return currentMinutes >= startMin && currentMinutes < endMin;
  });

  const startedIds: string[] = [];

  if (startingMeetings.length > 0) {
    const bookingIds = startingMeetings.map((b) => b.id);

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

    const { data: leaves } = await supabase
      .from("leaves")
      .select("user_id, leave_type, leave_date, duration, status")
      .in("user_id", allAttendeeIds.length > 0 ? allAttendeeIds : [""])
      .eq("leave_date", today)
      .eq("status", "approved");

    for (const booking of startingMeetings) {
      try {
        const attendees = attendeesByBooking.get(booking.id) || [];
        const attendeesWithStatus: AttendeeWithStatus[] = attendees.map((u) => ({
          user: u,
          status: resolveAttendeeStatus(u.id, today, (leaves as never) || [], booking.start_time),
        }));

        await startMeeting(supabase, booking, attendeesWithStatus);
        startedIds.push(booking.id);
      } catch (e) {
        console.error(`Error auto-starting meeting ${booking.id}:`, e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    completed: toComplete.length,
    checked: startingMeetings.length,
    started: startedIds.length,
    startedIds,
  });
}
