import { after } from "next/server";
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { postResponseUrl, openModal, updateModal } from "@/lib/slack/client";
import { parseSlackEOD } from "@/lib/redmine/parser";
import { decryptApiKey } from "@/lib/redmine/encryption";
import { decryptToken } from "@/lib/slack/encryption";
import { createTimeEntry, getTimeEntries } from "@/lib/redmine/client";
import { buildTimeLogModal, formatForRedmine } from "@/lib/slack/modal";
import type { ModalMetadata } from "@/lib/slack/modal";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ─── shared helpers ───────────────────────────────────────────────────────────

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function lookupUser(slackUserId: string, slackTeamId: string) {
  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("slack_user_id", slackUserId)
    .eq("slack_team_id", slackTeamId)
    .single();
  if (!user) return null;

  const { data: token } = await supabase
    .from("user_slack_tokens")
    .select("encrypted, iv, tag")
    .eq("user_id", user.id)
    .single();

  return { id: user.id, token };
}

/** Fetch how many hours the user has already logged to Redmine for a given date.
 *  Returns null if no Redmine config exists or if the fetch fails. */
async function fetchLoggedHours(
  userId: string,
  date: string
): Promise<number | null> {
  const supabase = createAdminClient();
  const { data: config } = await supabase
    .from("redmine_configs")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!config) return null;

  try {
    const apiKey = decryptApiKey(
      config.encrypted_api_key,
      config.encryption_iv,
      config.encryption_tag
    );
    const { entries, error } = await getTimeEntries(
      { redmineUrl: config.redmine_url, apiKey },
      date
    );
    if (error) return null;
    return entries.reduce((sum, e) => sum + e.hours, 0);
  } catch {
    return null;
  }
}

/** Extract the user's chosen date from modal state, falling back to metadata. */
function getSelectedDate(
  stateValues: Record<string, Record<string, { selected_date?: string | null; value?: string | null }>>,
  fallback: string
): string {
  return stateValues.date_block?.date_select?.selected_date ?? fallback;
}

// ─── message_action handler (INLINE — must complete within 3 s) ───────────────

async function handleMessageAction(payload: {
  trigger_id: string;
  user: { id: string };
  team: { id: string };
  message: { text: string };
  response_url: string;
}): Promise<Response> {
  const { trigger_id, user, team, message, response_url } = payload;
  const messageText = message?.text ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const dbUser = await lookupUser(user.id, team.id);

  if (!dbUser) {
    await postResponseUrl(response_url, {
      text: `Connect your Slack account at <${APP_URL}/settings/integrations/slack|Settings → Integrations → Slack>.`,
    });
    return new Response(null, { status: 200 });
  }

  if (!dbUser.token) {
    await postResponseUrl(response_url, {
      text: `Please reconnect your Slack account at <${APP_URL}/settings/integrations/slack|Settings → Integrations → Slack> to enable the new modal flow.`,
    });
    return new Response(null, { status: 200 });
  }

  const botToken = decryptToken(
    dbUser.token.encrypted,
    dbUser.token.iv,
    dbUser.token.tag
  );

  const parsed = parseSlackEOD(messageText);

  if (parsed.length === 0) {
    await postResponseUrl(response_url, {
      text: "No ticket entries found in that message.",
    });
    return new Response(null, { status: 200 });
  }

  const entries = parsed.map((e) => ({
    issueId: e.issueId,
    description: e.description,
  }));

  const metadata: ModalMetadata = {
    userId: dbUser.id,
    date: today,
    responseUrl: response_url,
    entries,
  };

  // Open the modal immediately (loggedHours: null = "loading…" placeholder).
  // The Redmine baseline fetch happens in the background after the trigger_id
  // window closes, then updates the modal via views.update.
  const modal = buildTimeLogModal(entries, today, metadata, { loggedHours: null });
  const result = await openModal(botToken, trigger_id, modal);

  if (!result.ok) {
    await postResponseUrl(response_url, {
      text: `Failed to open the time log modal: ${result.error ?? "unknown error"}. Please try again.`,
    });
    return new Response(null, { status: 200 });
  }

  const viewId = result.view?.id;
  if (viewId) {
    after(async () => {
      const logged = await fetchLoggedHours(dbUser.id, today);
      await updateModal(
        botToken,
        viewId,
        buildTimeLogModal(entries, today, metadata, { loggedHours: logged })
      );
    });
  }

  return new Response(null, { status: 200 });
}

// ─── block_actions: date changed ─────────────────────────────────────────────

async function handleDateChange(payload: {
  user: { id: string };
  team: { id: string };
  view: {
    id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { selected_date?: string | null; value?: string | null }>> };
  };
  actions: Array<{ action_id: string; selected_date?: string }>;
}): Promise<Response> {
  const { view } = payload;

  let metadata: ModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata) as ModalMetadata;
  } catch {
    return new Response(null, { status: 200 });
  }

  const viewId = view.id;
  const newDate =
    payload.actions[0]?.selected_date ??
    getSelectedDate(view.state.values, metadata.date);

  after(async () => {
    const supabase = createAdminClient();
    const { data: token } = await supabase
      .from("user_slack_tokens")
      .select("encrypted, iv, tag")
      .eq("user_id", metadata.userId)
      .single();

    const botToken = token
      ? decryptToken(token.encrypted, token.iv, token.tag)
      : null;

    if (!botToken) return;

    const logged = await fetchLoggedHours(metadata.userId, newDate);
    await updateModal(
      botToken,
      viewId,
      buildTimeLogModal(metadata.entries, newDate, metadata, {
        loggedHours: logged,
      })
    );
  });

  return new Response(null, { status: 200 });
}

// ─── view_submission: Submit to Redmine ──────────────────────────────────────

async function handleViewSubmission(payload: {
  view: {
    private_metadata: string;
    state: {
      values: Record<
        string,
        Record<
          string,
          {
            selected_date?: string | null;
            value?: string | null;
            selected_option?: { value?: string } | null;
          }
        >
      >;
    };
  };
}): Promise<Response> {
  const { view } = payload;

  let metadata: ModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata) as ModalMetadata;
  } catch {
    return jsonResponse({ response_action: "clear" });
  }

  const logDate = getSelectedDate(view.state.values, metadata.date);

  // Validate hours synchronously — Slack shows native inline errors per ticket.
  const hoursMap: Record<number, number> = {};
  const errors: Record<string, string> = {};
  for (const entry of metadata.entries) {
    const raw = view.state.values[`ticket_${entry.issueId}`]?.[`hours_${entry.issueId}`]?.value ?? null;
    const hours = raw !== null ? parseFloat(raw) : NaN;
    if (!raw || isNaN(hours) || hours <= 0) {
      errors[`ticket_${entry.issueId}`] = "Enter valid hours (greater than 0).";
    } else {
      hoursMap[entry.issueId] = hours;
    }
  }

  if (Object.keys(errors).length > 0) {
    return jsonResponse({ response_action: "errors", errors });
  }

  // Valid — `clear` closes the modal immediately; submit to Redmine in the background.
  after(async () => {
    const supabase = createAdminClient();
    const { data: config } = await supabase
      .from("redmine_configs")
      .select("*")
      .eq("user_id", metadata.userId)
      .single();

    if (!config) {
      await postResponseUrl(metadata.responseUrl, {
        text: `Configure Redmine at <${APP_URL}/time-logger|Time Logger settings> before submitting.`,
      });
      return;
    }

    if (!config.default_activity_id) {
      await postResponseUrl(metadata.responseUrl, {
        text: `Pick a default activity in <${APP_URL}/time-logger|Time Logger settings> before submitting.`,
      });
      return;
    }

    const apiKey = decryptApiKey(config.encrypted_api_key, config.encryption_iv, config.encryption_tag);
    const opts = { redmineUrl: config.redmine_url, apiKey };

    let submitted = 0;
    let failed = 0;

    await Promise.all(
      metadata.entries.map(async (entry) => {
        const result = await createTimeEntry(opts, {
          issue_id: entry.issueId,
          spent_on: logDate,
          hours: hoursMap[entry.issueId],
          activity_id: config.default_activity_id,
          comments: formatForRedmine(entry.description),
        });
        if (result.error) failed++; else submitted++;
      })
    );

    const failedPart = failed > 0 ? ` (${failed} failed)` : "";
    await postResponseUrl(metadata.responseUrl, {
      text: `✅ Submitted ${submitted} entr${submitted !== 1 ? "ies" : "y"} to Redmine on ${logDate}${failedPart}.`,
    });
  });

  return jsonResponse({ response_action: "clear" });
}

// ─── main POST handler ────────────────────────────────────────────────────────

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return new Response(null, { status: 200 });
  }

  if (
    payload.type === "message_action" &&
    payload.callback_id === "log_eod_to_time_logger"
  ) {
    return handleMessageAction(payload);
  }

  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "log_eod_to_time_logger"
  ) {
    return handleViewSubmission(payload);
  }

  if (payload.type === "block_actions" && Array.isArray(payload.actions)) {
    const actionId = payload.actions[0]?.action_id;
    if (actionId === "date_select") return handleDateChange(payload);
  }

  return new Response(null, { status: 200 });
}
