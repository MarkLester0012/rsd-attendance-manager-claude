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

  // Get recent leaves
  const { data: recentLeaves } = await supabase
    .from("leaves")
    .select("*, user:users(name, department_id)")
    .order("created_at", { ascending: false })
    .limit(5);

  // Get announcements
  const { data: announcements } = await supabase
    .from("announcements")
    .select("*, author:users(name)")
    .order("created_at", { ascending: false })
    .limit(3);

  // Get user's leave stats
  const { data: userLeaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("user_id", user!.id)
    .eq("status", "approved");

  // Get today's attendance
  const today = new Date().toISOString().split("T")[0];
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
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const { data: wfhThisMonth } = await supabase
    .from("leaves")
    .select("duration_value")
    .eq("user_id", user!.id)
    .eq("leave_type", "WFH")
    .eq("status", "approved")
    .gte("leave_date", startOfMonth.toISOString().split("T")[0]);

  const wfhUsed =
    wfhThisMonth?.reduce((sum, l) => sum + l.duration_value, 0) || 0;

  const inOfficeCount =
    (totalUsers || 0) - (todayLeaves?.length || 0);

  return (
    <DashboardContent
      user={user!}
      recentLeaves={recentLeaves || []}
      announcements={announcements || []}
      userLeaves={userLeaves || []}
      wfhUsed={wfhUsed}
      inOfficeCount={inOfficeCount}
      pendingCount={pendingCount}
      nextLeave={nextLeave?.[0] || null}
    />
  );
}
