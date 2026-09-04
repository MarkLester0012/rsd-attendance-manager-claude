import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeToMinutes } from "@/lib/utils/meeting-conflicts";
import { getWorkspaceBotToken, postChatMessage, postDirectMessage } from "@/lib/slack/client";
import { buildMeetingStartBlockKit, buildMeetingDM, type AttendeeWithStatus } from "@/lib/slack/meetings";
import { resolveAttendeeStatus } from "@/lib/utils/meeting-conflicts";
import type { User } from "@/lib/types";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const DEFAULT_CHANNEL = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";

export async function GET(req: Request) {
  // Optional cron authorization header check
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const supabase = createAdminClient();

  // Find meetings scheduled for today that should be starting now
  const { data: bookings } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(*)")
    .eq("meeting_date", today)
    .eq("status", "scheduled");

  const startingMeetings = (bookings || []).filter((b) => {
    const startMin = timeToMinutes(b.start_time);
    const endMin = timeToMinutes(b.end_time);
    // Trigger if we are at or past start_time, but haven't exceeded end_time
    return currentMinutes >= startMin && currentMinutes < endMin;
  });

  const botToken = await getWorkspaceBotToken();
  const startedIds: string[] = [];

  for (const booking of startingMeetings) {
    try {
      const { data: attendeesData } = await supabase
        .from("meeting_attendees")
        .select("*, user:users(*)")
        .eq("booking_id", booking.id);

      const attendees = (attendeesData || []).map((a: any) => a.user as User).filter(Boolean);
      const attendeeIds = attendees.map((a) => a.id);

      // Fetch leaves for status resolution
      const { data: leaves } = await supabase
        .from("leaves")
        .select("user_id, leave_type, leave_date, duration, status")
        .in("user_id", attendeeIds)
        .eq("leave_date", today)
        .eq("status", "approved");

      const attendeesWithStatus: AttendeeWithStatus[] = attendees.map((u) => ({
        user: u,
        status: resolveAttendeeStatus(u.id, today, (leaves as any) || []),
      }));

      let messageTs = booking.slack_message_ts;

      if (botToken) {
        const channelName = booking.slack_channel || DEFAULT_CHANNEL;
        const organizerUser = booking.organizer;

        // Post channel broadcast
        if (booking.notify_channel) {
          const blocks = buildMeetingStartBlockKit(booking, organizerUser, attendeesWithStatus, APP_URL);
          const postResult = await postChatMessage(
            botToken,
            channelName,
            `🚪 Meeting Starting Now: "${booking.title}" (${booking.start_time} - ${booking.end_time})`,
            blocks
          );
          if (postResult.ok && postResult.ts) {
            messageTs = postResult.ts;
          }
        }

        // Send DMs
        for (const item of attendeesWithStatus) {
          if (item.user.slack_user_id && item.status !== "on_leave") {
            const dmPayload = buildMeetingDM(booking, item.status, APP_URL);
            await postDirectMessage(botToken, item.user.slack_user_id, dmPayload.text, dmPayload.blocks);
          }
        }
      }

      // Mark in_progress
      await supabase
        .from("meeting_room_bookings")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          slack_message_ts: messageTs,
        })
        .eq("id", booking.id);

      startedIds.push(booking.id);
    } catch (e) {
      console.error(`Error auto-starting meeting ${booking.id}:`, e);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: bookings?.length || 0,
    started: startedIds.length,
    startedIds,
  });
}
