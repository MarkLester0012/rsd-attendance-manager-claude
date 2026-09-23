import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingBooking, User } from "@/lib/types";
import { getWorkspaceBotToken, postChatMessage, postDirectMessage } from "@/lib/slack/client";
import {
  buildMeetingBookedBlockKit,
  buildMeetingInvitedDM,
  buildMeetingStartBlockKit,
  buildMeetingDM,
  type AttendeeWithStatus,
} from "@/lib/slack/meetings";
import { DEFAULT_CHANNEL } from "@/lib/meetings/config";

/**
 * DMs the organizer a "Meeting Booked" confirmation and each attendee a
 * "Meeting Invitation" — no channel post. Shared by both booking entry
 * points (the web server action and the Slack `/meeting-room book` modal
 * submission) so this is written once, like `createBookingCore` for the DB
 * write.
 *
 * Deliberately NOT gated on `booking.notify_channel` — that toggle's own UI
 * copy ("Posts a Block Kit card to the channel and sends direct messages to
 * attendees when meeting starts") only ever claimed to cover the channel
 * post and the meeting-start DMs, never this booking confirmation. Gating it
 * here too was a bug: turning the toggle off silently suppressed an
 * organizer's own confirmation of their own booking.
 */
export async function notifyBookingCreated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  booking: MeetingBooking,
  organizer: User,
  attendeeIds: string[],
  appUrl: string
): Promise<void> {
  const botToken = await getWorkspaceBotToken();
  if (!botToken) return;

  const { data: attendeeUsers } =
    attendeeIds.length > 0
      ? await supabase.from("users").select("*").in("id", attendeeIds)
      : { data: [] as never[] };

  const attendees = (attendeeUsers as User[]) || [];
  const others = attendees.filter((u) => u.id !== organizer.id);

  if (organizer.slack_user_id) {
    const message = buildMeetingBookedBlockKit(booking, organizer, attendees, appUrl);
    const result = await postDirectMessage(
      botToken,
      organizer.slack_user_id,
      message.text,
      message.blocks,
      message.color
    );
    if (!result.ok) {
      console.error(`Failed to DM organizer for booking ${booking.id}:`, result.error);
    }
  }

  const invitedMessage = buildMeetingInvitedDM(booking, organizer, attendees, appUrl);
  await Promise.allSettled(
    others
      .filter((u) => u.slack_user_id)
      .map((u) =>
        postDirectMessage(botToken, u.slack_user_id as string, invitedMessage.text, invitedMessage.blocks, invitedMessage.color)
      )
  );
}

/**
 * Posts the "Meeting Room In Use" channel message for a meeting that just
 * started (no-op when `booking.notify_channel` is off), and records the
 * resulting `slack_message_ts` on the booking row. Returns a short warning
 * string only when the post itself failed (bad channel name, bot not
 * invited, etc.) — shared by the manual "Start & Notify Slack" action
 * (meeting-room/actions.ts, which surfaces the warning as a toast) and the
 * auto-start cron (api/cron/meetings/route.ts, which doesn't).
 */
export async function postMeetingStartChannelMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  booking: MeetingBooking,
  organizer: User,
  attendeesWithStatus: AttendeeWithStatus[],
  appUrl: string,
  botToken: string
): Promise<string | undefined> {
  if (!booking.notify_channel) return undefined;

  const channelName = booking.slack_channel || DEFAULT_CHANNEL;
  const message = buildMeetingStartBlockKit(booking, organizer, attendeesWithStatus, appUrl);
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
    return undefined;
  }

  console.error(`Failed to post meeting-start message for booking ${booking.id}:`, postResult.error);
  return `Meeting started, but the Slack post to #${channelName} failed: ${postResult.error ?? "unknown error"}`;
}

/**
 * Sends the per-attendee "Meeting Starting Now" DM to every attendee with a
 * linked Slack account — unconditional on `notify_channel` (the toggle only
 * ever covered the channel post). Shared by the same two callers as
 * postMeetingStartChannelMessage above.
 */
export async function sendMeetingStartDMs(
  botToken: string,
  booking: MeetingBooking,
  organizer: User,
  attendeesWithStatus: AttendeeWithStatus[],
  appUrl: string
): Promise<void> {
  await Promise.allSettled(
    attendeesWithStatus
      .filter((item) => item.user.slack_user_id)
      .map((item) => {
        const dmPayload = buildMeetingDM(booking, organizer, item.status, appUrl);
        return postDirectMessage(
          botToken,
          item.user.slack_user_id as string,
          dmPayload.text,
          dmPayload.blocks,
          dmPayload.color
        );
      })
  );
}
