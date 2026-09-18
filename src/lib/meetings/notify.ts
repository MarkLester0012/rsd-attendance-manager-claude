import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingBooking, User } from "@/lib/types";
import { getWorkspaceBotToken, postDirectMessage } from "@/lib/slack/client";
import { buildMeetingBookedBlockKit, buildMeetingInvitedDM } from "@/lib/slack/meetings";

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
