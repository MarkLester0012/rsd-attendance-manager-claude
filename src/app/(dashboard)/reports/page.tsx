import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { ReportsContent } from "./reports-content";

export default async function ReportsPage() {
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

  const { data: leaves } = await supabase
    .from("leaves")
    .select("*, user:users!leaves_user_id_fkey(name, department_id, department:departments(name))")
    .eq("status", "approved")
    .order("leave_date", { ascending: true });

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .order("name");

  return (
    <ReportsContent leaves={leaves || []} departments={departments || []} />
  );
}
