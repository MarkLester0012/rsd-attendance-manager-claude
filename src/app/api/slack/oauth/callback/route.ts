import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyState } from "@/lib/slack/state";
import { exchangeOAuthCode } from "@/lib/slack/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = req.nextUrl;

  const state = searchParams.get("state");
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations/slack?error=access_denied`);
  }

  const statePayload = verifyState(state);
  if (!statePayload) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations/slack?error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations/slack?error=missing_code`);
  }

  const redirectUri = `${APP_URL}/api/slack/oauth/callback`;
  const result = await exchangeOAuthCode(code, redirectUri);

  if ("error" in result) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations/slack?error=oauth_failed`);
  }

  const supabase = createAdminClient();
  await supabase
    .from("users")
    .update({
      slack_user_id: result.authed_user.id,
      slack_team_id: result.team.id,
    })
    .eq("id", statePayload.userId);

  return NextResponse.redirect(`${APP_URL}/settings/integrations/slack?connected=1`);
}
