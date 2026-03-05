import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { HolidaysContent } from "./holidays-content";

export default async function HolidaysPage() {
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

  const { data: holidays } = await supabase
    .from("holidays")
    .select("*")
    .order("observed_date", { ascending: true });

  return <HolidaysContent initialHolidays={holidays || []} />;
}
