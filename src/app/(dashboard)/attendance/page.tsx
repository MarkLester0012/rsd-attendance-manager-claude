import { createClient } from "@/lib/supabase/server";
import { AttendanceContent } from "./attendance-content";

export default async function AttendancePage() {
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("users")
    .select("*, department:departments(name)")
    .order("name");

  const today = new Date().toISOString().split("T")[0];

  const { data: todayLeaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("leave_date", today)
    .eq("status", "approved");

  const { data: projects } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .order("name");

  return (
    <AttendanceContent
      users={users || []}
      initialLeaves={todayLeaves || []}
      initialDate={today}
      projects={projects || []}
    />
  );
}
