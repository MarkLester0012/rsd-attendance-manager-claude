import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { TeamContent } from "./team-content";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authUser.id)
    .single();

  if (!user || user.role === "member") return <AccessDenied />;

  const { data: users } = await supabase
    .from("users")
    .select("*, department:departments(*)")
    .order("name");

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .order("name");

  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: upcomingLeaves } = await supabase
    .from("leaves")
    .select("*, user:users!leaves_user_id_fkey(name, department_id)")
    .gte("leave_date", today)
    .lte("leave_date", nextWeek)
    .eq("status", "approved")
    .order("leave_date");

  const { data: projects } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .order("name");

  return (
    <TeamContent
      currentUser={user}
      users={users || []}
      departments={departments || []}
      upcomingLeaves={(upcomingLeaves as any[]) || []}
      projects={projects || []}
    />
  );
}
