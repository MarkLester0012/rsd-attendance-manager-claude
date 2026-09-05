import type { SupabaseClient } from "@supabase/supabase-js";
import { timeToMinutes } from "@/lib/utils/meeting-conflicts";
import type { MeetingBooking } from "@/lib/types";

/**
 * Shared booking-creation core, used by both the web server action
 * (meeting-room/actions.ts, session-scoped client) and the Slack "/meeting-room
 * book" command (shortcut/route.ts, admin client + a Slack-resolved user) so
 * validation, the collision path, and the attendee insert live in one place.
 *
 * Does NOT send notifications or Slack messages — callers do that afterward,
 * because the two call sites use different notification mechanisms (the RPC
 * for the session-scoped web action vs. a direct admin insert for the
 * session-less Slack command).
 */

export interface CreateBookingCoreInput {
  title: string;
  description?: string;
  meeting_date: string; // 'yyyy-MM-dd'
  start_time: string; // 'HH:mm'
  end_time: string; // 'HH:mm'
  attendee_ids: string[];
  notify_channel?: boolean;
  slack_channel?: string;
}

export type CreateBookingCoreResult =
  | { error: string }
  | { booking: MeetingBooking; attendeeIds: string[] };

export const VALID_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export async function createBookingCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  organizerId: string,
  input: CreateBookingCoreInput,
  defaultChannel: string
): Promise<CreateBookingCoreResult> {
  const title = input.title.trim();
  if (!title) {
    return { error: "Meeting title is required" };
  }
  if (!VALID_TIME.test(input.start_time) || !VALID_TIME.test(input.end_time)) {
    return { error: "Invalid meeting time" };
  }
  if (timeToMinutes(input.end_time) <= timeToMinutes(input.start_time)) {
    return { error: "End time must be after start time" };
  }

  const notify_channel = input.notify_channel ?? true;
  const slack_channel = input.slack_channel || defaultChannel;

  const { data: newBooking, error: bookingErr } = await supabase
    .from("meeting_room_bookings")
    .insert({
      title,
      description: input.description?.trim() || null,
      organizer_id: organizerId,
      meeting_date: input.meeting_date,
      start_time: input.start_time,
      end_time: input.end_time,
      status: "scheduled",
      notify_channel,
      slack_channel,
    })
    .select()
    .single();

  if (bookingErr || !newBooking) {
    // 23P01 = exclusion_violation, raised by meeting_room_no_overlap when this
    // slot collides with another active booking (the DB-level backstop behind
    // the app's own pre-check).
    if (bookingErr?.code === "23P01") {
      return {
        error: "The meeting room is already booked for an overlapping time slot.",
      };
    }
    return { error: bookingErr?.message || "Failed to create booking" };
  }

  const allAttendeeIds = Array.from(new Set([organizerId, ...input.attendee_ids]));
  const attendeeRows = allAttendeeIds.map((userId) => ({
    booking_id: newBooking.id,
    user_id: userId,
  }));

  const { error: attendeeErr } = await supabase.from("meeting_attendees").insert(attendeeRows);
  if (attendeeErr) {
    // Roll back the booking rather than leaving an attendee-less meeting that
    // reports success.
    await supabase.from("meeting_room_bookings").delete().eq("id", newBooking.id);
    return { error: `Failed to add attendees: ${attendeeErr.message}` };
  }

  return { booking: newBooking as MeetingBooking, attendeeIds: allAttendeeIds };
}
