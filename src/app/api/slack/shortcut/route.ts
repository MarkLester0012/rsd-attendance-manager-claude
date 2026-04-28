import { after } from "next/server";
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { postResponseUrl } from "@/lib/slack/client";
import { ingestSlackEOD } from "@/lib/slack/ingest";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const valid = verifySlackSignature(
    raw,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature")
  );

  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return new Response(null, { status: 200 });
  }

  let payload: {
    type: string;
    callback_id: string;
    user: { id: string };
    team: { id: string };
    message: { text: string };
    response_url: string;
  };

  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return new Response(null, { status: 200 });
  }

  if (
    payload.type !== "message_action" ||
    payload.callback_id !== "log_eod_to_time_logger"
  ) {
    return new Response(null, { status: 200 });
  }

  const slackUserId = payload.user?.id;
  const messageText = payload.message?.text ?? "";
  const responseUrl = payload.response_url;

  after(async () => {
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("slack_user_id", slackUserId)
      .single();

    if (!user) {
      await postResponseUrl(responseUrl, {
        text: `Connect your Slack account at <${APP_URL}/settings/integrations/slack|Settings → Integrations → Slack>.`,
      });
      return;
    }

    await ingestSlackEOD(user.id, messageText, responseUrl);
  });

  return new Response(null, { status: 200 });
}
