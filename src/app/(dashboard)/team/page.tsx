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

  // Fetch approved leaves that deduct balance to compute used leaves per user
  const { data: usedLeavesRaw } = await supabase
    .from("leaves")
    .select("user_id, duration_value, leave_type")
    .eq("status", "approved")
    .in("leave_type", ["VL", "PL", "ML", "SPL", "SL", "AB"]);

  const usedLeavesMap: Record<string, number> = {};
  (usedLeavesRaw || []).forEach((l) => {
    usedLeavesMap[l.user_id] = (usedLeavesMap[l.user_id] || 0) + l.duration_value;
  });

  const { data: projects } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .order("name");

  return (
    <TeamContent
      currentUser={user}
      users={users || []}
      departments={departments || []}
      usedLeavesMap={usedLeavesMap}
      projects={projects || []}
    />
  );
}
