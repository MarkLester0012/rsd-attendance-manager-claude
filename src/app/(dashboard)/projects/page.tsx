import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { ProjectsContent } from "./projects-content";

export default async function ProjectsPage() {
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

  if (!user || user.role !== "leader") return <AccessDenied />;

  const { data: projects } = await supabase
    .from("projects")
    .select("*, project_members(id, user_id, user:users(id, name, role))")
    .order("name");

  const { data: leaders } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("role", "leader")
    .order("name");

  const { data: members } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("role", "member")
    .order("name");

  return (
    <ProjectsContent
      currentUser={user}
      initialProjects={projects || []}
      leaders={leaders || []}
      members={members || []}
    />
  );
}
