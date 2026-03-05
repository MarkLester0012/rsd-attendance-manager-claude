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
    <TeamContent
      currentUser={user}
      users={users || []}
      departments={departments || []}
      todayLeaves={todayLeaves || []}
      projects={projects || []}
    />
  );
}
