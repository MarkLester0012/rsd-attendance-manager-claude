import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileContent } from "./profile-content";

export default async function ProfilePage() {
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

  return <ProfileContent user={user} />;
}
