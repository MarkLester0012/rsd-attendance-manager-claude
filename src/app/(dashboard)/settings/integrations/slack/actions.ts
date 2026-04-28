"use server";

import { createClient } from "@/lib/supabase/server";

export async function disconnectSlack(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("users")
    .update({ slack_user_id: null, slack_team_id: null })
    .eq("auth_id", authUser.id);

  if (error) return { error: error.message };
  return {};
}
