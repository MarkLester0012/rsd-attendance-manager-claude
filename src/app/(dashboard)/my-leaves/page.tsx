import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MyLeavesContent } from "./my-leaves-content";

export default async function MyLeavesPage() {
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

  const { data: leaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("user_id", user.id)
    .order("leave_date", { ascending: false });

  return <MyLeavesContent user={user} initialLeaves={leaves || []} />;
}
