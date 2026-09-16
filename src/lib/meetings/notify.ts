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
 */
export async function notifyBookingCreated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  booking: MeetingBooking,
  organizer: User,
  attendeeIds: string[],
  appUrl: string
): Promise<void> {
  if (!booking.notify_channel) return;

  const botToken = await getWorkspaceBotToken();
  if (!botToken) return;

  const { data: attendeeUsers } = await supabase
    .from("users")
    .select("*")
    .in("id", attendeeIds.length > 0 ? attendeeIds : [""]);

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

  await Promise.allSettled(
    others
      .filter((u) => u.slack_user_id)
      .map((u) => {
        const message = buildMeetingInvitedDM(booking, organizer, attendees, appUrl);
        return postDirectMessage(botToken, u.slack_user_id as string, message.text, message.blocks, message.color);
      })
  );
}
