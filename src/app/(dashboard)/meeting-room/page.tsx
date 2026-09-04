import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { MeetingRoomContent } from "./meeting-room-content";
import type { MeetingWithAttendees, User } from "@/lib/types";

export const metadata = {
  title: "Meeting Room Manager | RSD Attendance Manager",
  description: "Schedule and manage company meeting room occupancy and Slack announcements",
};

export default async function MeetingRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const selectedDate = date || todayStr;

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

  // Fetch bookings on the selected date
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
        user:users(*)
      )
    `)
    .eq("meeting_date", selectedDate)
    .order("start_time", { ascending: true });

  // Fetch active users for attendee selection
  const { data: allUsers } = await supabase
    .from("users")
    .select("*")
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
      allUsers={(allUsers || []) as User[]}
      initialBookings={(bookingsData || []) as any as MeetingWithAttendees[]}
      leaves={(leaves || []) as any}
      currentDateStr={selectedDate}
    />
  );
}
