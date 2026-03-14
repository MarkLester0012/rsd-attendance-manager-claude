import { createClient } from "@/lib/supabase/server";
import { CalendarContent } from "./calendar-content";

export default async function CalendarPage() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authUser!.id)
    .single();

  // Get current month leaves
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const { data: leaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("user_id", user!.id)
    .gte("leave_date", startOfMonth)
    .lte("leave_date", endOfMonth)
    .in("status", ["approved", "pending"]);

  const { data: holidays } = await supabase
    .from("holidays")
    .select("*")
    .gte("observed_date", startOfMonth)
    .lte("observed_date", endOfMonth);

  // Get all WFH leaves for the month (all users) for the WFH tracker
  const { data: monthWfhAll } = await supabase
    .from("leaves")
    .select("leave_date, duration_value, user:users!user_id(name)")
    .eq("leave_type", "WFH")
    .eq("status", "approved")
    .gte("leave_date", startOfMonth)
    .lte("leave_date", endOfMonth)
    .order("leave_date", { ascending: true });

  return (
    <CalendarContent
      user={user!}
      initialLeaves={leaves || []}
      holidays={holidays || []}
      initialWfhAll={(monthWfhAll || []) as any}
    />
  );
}
