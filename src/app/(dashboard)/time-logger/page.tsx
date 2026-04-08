import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TimeLoggerContent } from "./time-logger-content";

export default async function TimeLoggerPage() {
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

  // Check if user has Redmine config
  const { data: redmineConfig } = await supabase
    .from("redmine_configs")
    .select("id, redmine_url, default_activity_id")
    .eq("user_id", user.id)
    .single();

  // Fetch today's draft/failed entries
  const today = new Date().toISOString().split("T")[0];
  const { data: entries } = await supabase
    .from("time_log_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("log_date", today)
    .order("created_at", { ascending: true });

  return (
    <TimeLoggerContent
      currentUser={user}
      hasConfig={!!redmineConfig}
      defaultActivityId={redmineConfig?.default_activity_id ?? null}
      initialEntries={entries || []}
      initialDate={today}
    />
  );
}
