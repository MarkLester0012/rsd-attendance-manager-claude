import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isValid, parseISO } from "date-fns";
import { MeetingRoomContent } from "./meeting-room-content";
import { officeDateString } from "@/lib/utils/office-time";
import type { LeaveRecord } from "@/lib/utils/meeting-conflicts";
import type { MeetingWithAttendees, User } from "@/lib/types";

export const metadata = {
  title: "Meeting Room Manager | RSD Attendance Manager",
  description: "Schedule and manage company meeting room occupancy and Slack announcements",
};

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

  const { data: user } = await supabase
    .from("users")
    .select("*, department:departments(*)")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) redirect("/login");

  // Fetch bookings on the selected date. The nested user select on attendees
  // includes department so the attendee-detail popover doesn't need a
  // separate query.
  const { data: bookingsData } = await supabase
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
    .order("start_time", { ascending: true });

  // Fetch active users for attendee selection — narrowed to only the columns
  // the attendee picker and detail popover actually use, rather than shipping
  // every column of every employee to the browser.
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, name, email, role, department_id, slack_user_id, department:departments(*)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Fetch approved leaves on the selected date for attendee status resolution
  const { data: leaves } = await supabase
    .from("leaves")
    .select("user_id, leave_type, leave_date, duration, status")
    .eq("leave_date", selectedDate)
    .eq("status", "approved");

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
    />
  );
}
