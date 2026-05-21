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
