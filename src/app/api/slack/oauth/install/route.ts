import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signState } from "@/lib/slack/state";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) {
    return new Response("User not found", { status: 401 });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${APP_URL}/api/slack/oauth/callback`;

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
  url.searchParams.set("scope", "commands");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", signState(user.id));

  return NextResponse.redirect(url.toString(), { status: 302 });
}
