/**
 * Safely parses a Slack API response as JSON. Slack can return non-JSON bodies
 * (e.g. HTML) on 5xx errors or when rate-limited, which would otherwise throw
 * an unhandled SyntaxError deep inside a server action.
 */
async function safeSlackJson(res: Response): Promise<{ ok: boolean; [key: string]: unknown }> {
  try {
    const data = await res.json();
    return data;
  } catch {
    return { ok: false, error: `slack_non_json_response_${res.status}` };
  }
}

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
 * Retrieves the workspace bot token from SLACK_BOT_TOKEN. There is deliberately
 * no fallback to a row in user_slack_tokens: that table holds per-user OAuth
 * tokens linked via Settings > Integrations, and picking an arbitrary one to
 * post as "the workspace bot" would post under a random employee's identity
 * and break the moment that employee disconnects Slack.
 */
export async function getWorkspaceBotToken(): Promise<string | null> {
  if (process.env.SLACK_BOT_TOKEN) {
    return process.env.SLACK_BOT_TOKEN;
  }
  console.error(
    "SLACK_BOT_TOKEN is not set — meeting room Slack notifications are disabled."
  );
  return null;
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

  return safeSlackJson(res) as Promise<{ ok: boolean; ts?: string; error?: string }>;
}

/**
 * Sends a Direct Message to a specific Slack user. `chat.postMessage` accepts a
 * user ID directly as `channel` — Slack opens (or reuses) the DM automatically,
 * so no separate `conversations.open` round-trip is needed.
 */
export async function postDirectMessage(
  botToken: string,
  slackUserId: string,
  text: string,
  blocks?: object[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  return postChatMessage(botToken, slackUserId, text, blocks);
}

