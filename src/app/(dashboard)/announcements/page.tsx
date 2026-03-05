import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { AnnouncementsContent } from "./announcements-content";

export default async function AnnouncementsPage() {
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

  if (!user || user.role !== "hr") return <AccessDenied />;

  const { data: announcements } = await supabase
    .from("announcements")
    .select("*, author:users(name)")
    .order("created_at", { ascending: false });

  return (
    <AnnouncementsContent
      currentUser={user}
      initialAnnouncements={announcements || []}
    />
  );
}
