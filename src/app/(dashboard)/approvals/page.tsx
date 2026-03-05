import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { ApprovalsContent } from "./approvals-content";

export default async function ApprovalsPage() {
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

  const { data: leaves } = await supabase
    .from("leaves")
    .select(
      "*, user:users!leaves_user_id_fkey(id, name, email, role, department_id)"
    )
    .order("created_at", { ascending: false });

  return <ApprovalsContent user={user} initialLeaves={leaves || []} />;
}
