import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingBooking, User } from "@/lib/types";
import { getWorkspaceBotToken, postChatMessage } from "@/lib/slack/client";
import { buildMeetingBookedBlockKit, MEETING_COLORS } from "@/lib/slack/meetings";

/**
 * Posts the "Meeting Booked" broadcast to the meeting's Slack channel.
 * Shared by both booking entry points (the web server action and the Slack
 * `/meeting-room book` modal submission) so the channel post — like
 * `createBookingCore` for the DB write — is written once.
 *
 * Channel post only; no per-attendee DM fan-out on booking (DMs stay
 * reserved for when the meeting actually starts).
 */
export async function notifyBookingCreated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  booking: MeetingBooking,
  organizer: User,
  attendeeIds: string[],
  appUrl: string,
  defaultChannel: string
): Promise<void> {
  if (!booking.notify_channel) return;

  const botToken = await getWorkspaceBotToken();
  if (!botToken) return;

  const { data: attendeeUsers } = await supabase
    .from("users")
    .select("*")
    .in("id", attendeeIds.length > 0 ? attendeeIds : [""]);

  const message = buildMeetingBookedBlockKit(
    booking,
    organizer,
    (attendeeUsers as User[]) || [],
    appUrl
  );

  const result = await postChatMessage(
    botToken,
    booking.slack_channel || defaultChannel,
    message.text,
    message.blocks,
    MEETING_COLORS.booked
  );
  if (!result.ok) {
    console.error(`Failed to post booking-created message for booking ${booking.id}:`, result.error);
  }
}
