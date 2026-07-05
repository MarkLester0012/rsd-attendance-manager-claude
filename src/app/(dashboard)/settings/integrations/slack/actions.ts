"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function disconnectSlack(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { error: "Not authenticated" };

  const { data: user, error } = await supabase
    .from("users")
    .update({ slack_user_id: null, slack_team_id: null })
    .eq("auth_id", authUser.id)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Token rows are only accessible via the service-role client.
  if (user) {
    await createAdminClient()
      .from("user_slack_tokens")
      .delete()
      .eq("user_id", user.id);
  }

  return {};
}
