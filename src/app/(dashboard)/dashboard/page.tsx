import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "./dashboard-content";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const { data: user } = await supabase
    .from("users")
    .select("*, department:departments(*)")
    .eq("auth_id", authUser!.id)
    .single();

  const today = new Date().toISOString().split("T")[0];

  // Get current month's holidays
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
  const { data: upcomingHolidays } = await supabase
    .from("holidays")
    .select("*")
    .gte("observed_date", startOfMonth.toISOString().split("T")[0])
    .lte("observed_date", endOfMonth.toISOString().split("T")[0])
    .order("observed_date", { ascending: true });

  // Get announcements (all recent, scrollable on client)
  const { data: announcements } = await supabase
    .from("announcements")
    .select("*, author:users(name)")
    .order("created_at", { ascending: false })
    .limit(10);

  // Get user's leave stats
  const { data: userLeaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("user_id", user!.id)
    .eq("status", "approved");

  // Get today's attendance
  const { data: todayLeaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("leave_date", today)
    .eq("status", "approved");

  const { count: totalUsers } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  // Pending approvals count for leaders/HR
  let pendingCount = 0;
  if (user!.role === "leader" || user!.role === "hr") {
    const { count } = await supabase
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count || 0;
  }

  // Next scheduled leave
  const { data: nextLeave } = await supabase
    .from("leaves")
    .select("*")
    .eq("user_id", user!.id)
    .eq("status", "approved")
    .gte("leave_date", today)
    .order("leave_date", { ascending: true })
    .limit(1);

  // WFH this month
  const { data: wfhThisMonth } = await supabase
    .from("leaves")
    .select("duration_value")
    .eq("user_id", user!.id)
    .eq("leave_type", "WFH")
    .eq("status", "approved")
    .gte("leave_date", startOfMonth.toISOString().split("T")[0]);

  const wfhUsed =
    wfhThisMonth?.reduce((sum, l) => sum + l.duration_value, 0) || 0;

  const actualAbsent = todayLeaves?.filter(
    (l) => !["WFH", "NW", "RGA"].includes(l.leave_type)
  ).length || 0;
  const inOfficeCount = (totalUsers || 0) - actualAbsent;

  return (
    <DashboardContent
      user={user!}
      upcomingHolidays={upcomingHolidays || []}
      announcements={announcements || []}
      userLeaves={userLeaves || []}
      wfhUsed={wfhUsed}
      inOfficeCount={inOfficeCount}
      pendingCount={pendingCount}
      nextLeave={nextLeave?.[0] || null}
    />
  );
}
