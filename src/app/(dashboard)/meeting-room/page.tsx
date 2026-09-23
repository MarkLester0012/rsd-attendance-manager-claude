import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isValid, parseISO } from "date-fns";
import { MeetingRoomContent } from "./meeting-room-content";
import { officeDateString } from "@/lib/utils/office-time";
import { MEETING_BOOKINGS_SELECT } from "@/lib/meetings/queries";
import { DEFAULT_CHANNEL } from "@/lib/meetings/config";
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

  // The user query, bookings query, and leaves query are independent of one
  // another (only the earlier auth.getUser() session establishes the RLS
  // context they all need), so they run in parallel instead of one after
  // another — this used to block every prev/next date click behind
  // sequential round trips. The allUsers query, however, is only needed for
  // leader/HR (members can never open a booking modal), so it's chained off
  // the user query's result instead of running unconditionally in parallel.
  const userPromise = supabase
    .from("users")
    .select("*, department:departments(*)")
    .eq("auth_id", authUser.id)
    .single();

  // Bookings on the selected date. The nested user select on attendees
  // includes department so the attendee-detail popover doesn't need a
  // separate query.
  const bookingsPromise = supabase
    .from("meeting_room_bookings")
    .select(MEETING_BOOKINGS_SELECT)
    .eq("meeting_date", selectedDate)
    .order("start_time", { ascending: true });

  // Approved leaves on the selected date for attendee status resolution
  const leavesPromise = supabase
    .from("leaves")
    .select("user_id, leave_type, leave_date, duration, status")
    .eq("leave_date", selectedDate)
    .eq("status", "approved");

  // All users for attendee selection — narrowed to only the columns the
  // attendee picker and detail popover actually use, rather than shipping
  // every column of every employee to the browser. Skipped entirely for
  // members, who can never open a booking modal.
  const allUsersPromise = userPromise.then(async ({ data }) => {
    if (!data || data.role === "member") {
      return { data: [] as User[], error: null };
    }
    const result = await supabase
      .from("users")
      .select("id, name, email, role, department_id, slack_user_id, department:departments(*)")
      .order("name", { ascending: true });
    // Verified by hand against the select() above — see the bookingsData cast below.
    return { data: (result.data || []) as unknown as User[], error: result.error };
  });

  const [{ data: user }, { data: bookingsData }, { data: allUsers }, { data: leaves }] = await Promise.all([
    userPromise,
    bookingsPromise,
    allUsersPromise,
    leavesPromise,
  ]);

  if (!user) redirect("/login");

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
      defaultSlackChannel={DEFAULT_CHANNEL}
    />
  );
}
