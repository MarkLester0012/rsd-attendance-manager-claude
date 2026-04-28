import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyState } from "@/lib/slack/state";
import { exchangeOAuthCode } from "@/lib/slack/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const settingsUrl = `${APP_URL}/settings/integrations/slack`;
  const { searchParams } = req.nextUrl;

  const state = searchParams.get("state");
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${settingsUrl}?error=access_denied`);
  }

  const statePayload = verifyState(state);
  if (!statePayload) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid_state`);
  }

  // Bind the OAuth flow to the currently logged-in app user.
  // Prevents an attacker from completing an OAuth flow against a victim's
  // account using a leaked state token.
  const authClient = await createClient();
  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) {
    return NextResponse.redirect(`${settingsUrl}?error=not_authenticated`);
  }

  const { data: dbUser } = await authClient
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .single();
  if (!dbUser || dbUser.id !== statePayload.userId) {
    return NextResponse.redirect(`${settingsUrl}?error=session_mismatch`);
  }

  if (!code) {
    return NextResponse.redirect(`${settingsUrl}?error=missing_code`);
  }

  const redirectUri = `${APP_URL}/api/slack/oauth/callback`;
  const result = await exchangeOAuthCode(code, redirectUri);

  if ("error" in result) {
    return NextResponse.redirect(`${settingsUrl}?error=oauth_failed`);
  }

  const supabase = createAdminClient();
  const { error: updateError } = await supabase
    .from("users")
    .update({
      slack_user_id: result.authed_user.id,
      slack_team_id: result.team.id,
    })
    .eq("id", statePayload.userId);

  if (updateError) {
    // UNIQUE constraint violation on slack_user_id means the Slack account
    // is already linked to a different app user.
    const code = updateError.code === "23505" ? "already_linked" : "update_failed";
    return NextResponse.redirect(`${settingsUrl}?error=${code}`);
  }

  return NextResponse.redirect(`${settingsUrl}?connected=1`);
}
