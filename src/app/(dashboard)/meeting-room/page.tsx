import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isValid, parseISO } from "date-fns";
import { MeetingRoomContent } from "./meeting-room-content";
import { officeDateString } from "@/lib/utils/office-time";
import type { LeaveRecord } from "@/lib/utils/meeting-conflicts";
import type { MeetingWithAttendees, User } from "@/lib/types";

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MeetingRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; meeting?: string }>;
}) {
  const { date, meeting } = await searchParams;
  const todayStr = officeDateString();
  const selectedDate =
    date && DATE_PARAM_RE.test(date) && isValid(parseISO(date)) ? date : todayStr;
  const highlightMeetingId = meeting && UUID_RE.test(meeting) ? meeting : null;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  // These four reads are independent of one another (only the earlier
  // auth.getUser() session establishes the RLS context they all need), so
  // they run in parallel instead of one after another — this used to block
  // every prev/next date click behind four sequential round trips.
  const [
    { data: user },
    { data: bookingsData },
    { data: allUsers },
    { data: leaves },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("*, department:departments(*)")
      .eq("auth_id", authUser.id)
      .single(),
    // Bookings on the selected date. The nested user select on attendees
    // includes department so the attendee-detail popover doesn't need a
    // separate query.
    supabase
      .from("meeting_room_bookings")
      .select(`
        *,
        organizer:users!meeting_room_bookings_organizer_id_fkey(*),
        attendees:meeting_attendees(
          id,
          booking_id,
          user_id,
          created_at,
          user:users(*, department:departments(*))
        )
      `)
      .eq("meeting_date", selectedDate)
      .order("start_time", { ascending: true }),
    // All users for attendee selection — narrowed to only the columns the
    // attendee picker and detail popover actually use, rather than shipping
    // every column of every employee to the browser.
    supabase
      .from("users")
      .select("id, name, email, role, department_id, slack_user_id, department:departments(*)")
      .order("name", { ascending: true }),
    // Approved leaves on the selected date for attendee status resolution
    supabase
      .from("leaves")
      .select("user_id, leave_type, leave_date, duration, status")
      .eq("leave_date", selectedDate)
      .eq("status", "approved"),
  ]);

  if (!user) redirect("/login");

  // SLACK_MEETING_ROOM_CHANNEL is deliberately not NEXT_PUBLIC_ (see CLAUDE.md),
  // so it can't be read client-side — read it here and thread it down as the
  // channel field's placeholder/fallback display value.
  const defaultSlackChannel = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";

  return (
    <MeetingRoomContent
      currentUser={user as User}
      allUsers={(allUsers || []) as unknown as User[]}
      // Supabase's generated types for this nested select (multiple joined
      // relations several levels deep) don't line up with MeetingWithAttendees;
      // the shape is verified by hand against the select() above.
      initialBookings={(bookingsData || []) as unknown as MeetingWithAttendees[]}
      leaves={(leaves || []) as unknown as LeaveRecord[]}
      currentDateStr={selectedDate}
      highlightMeetingId={highlightMeetingId}
      defaultSlackChannel={defaultSlackChannel}
    />
  );
}
