export async function postResponseUrl(
  responseUrl: string,
  payload: { text: string; response_type?: "ephemeral" | "in_channel" }
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", ...payload }),
  });
}

export async function exchangeOAuthCode(
  code: string,
  redirectUri: string
): Promise<
  | { authed_user: { id: string }; team: { id: string }; bot_token: string }
  | { error: string }
> {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    client_secret: process.env.SLACK_CLIENT_SECRET!,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (!data.ok) return { error: data.error || "oauth_failed" };
  return {
    authed_user: { id: data.authed_user.id },
    team: { id: data.team.id },
    bot_token: data.access_token as string,
  };
}

export async function openModal(
  botToken: string,
  triggerId: string,
  view: object
): Promise<{ ok: boolean; view?: { id: string }; error?: string }> {
  const res = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });
  return res.json();
}

export async function updateModal(
  botToken: string,
  viewId: string,
  view: object
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://slack.com/api/views.update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ view_id: viewId, view }),
  });
  return res.json();
}

/**
 * Retrieves an active decrypted Slack Bot Token.
 * First checks for SLACK_BOT_TOKEN in env, then falls back to user_slack_tokens in DB.
 */
export async function getWorkspaceBotToken(): Promise<string | null> {
  if (process.env.SLACK_BOT_TOKEN) {
    return process.env.SLACK_BOT_TOKEN;
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { decryptToken } = await import("@/lib/slack/encryption");
    const supabase = createAdminClient();

    const { data: tokens } = await supabase
      .from("user_slack_tokens")
      .select("encrypted, iv, tag")
      .limit(1);

    if (!tokens || tokens.length === 0) return null;

    return decryptToken(tokens[0].encrypted, tokens[0].iv, tokens[0].tag);
  } catch (err) {
    console.error("Failed to retrieve workspace bot token:", err);
    return null;
  }
}

/**
 * Posts a message to a public or private Slack channel.
 */
export async function postChatMessage(
  botToken: string,
  channel: string,
  text: string,
  blocks?: object[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const body: Record<string, unknown> = {
    channel,
    text,
  };
  if (blocks && blocks.length > 0) {
    body.blocks = blocks;
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

/**
 * Sends a Direct Message to a specific Slack user by opening a DM channel first.
 */
export async function postDirectMessage(
  botToken: string,
  slackUserId: string,
  text: string,
  blocks?: object[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  // Step 1: Open DM conversation
  const openRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ users: slackUserId }),
  });

  const openData = await openRes.json();
  if (!openData.ok || !openData.channel?.id) {
    return { ok: false, error: openData.error || "failed_to_open_dm" };
  }

  // Step 2: Post message to DM channel
  return postChatMessage(botToken, openData.channel.id, text, blocks);
}

