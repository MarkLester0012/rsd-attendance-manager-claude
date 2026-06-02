import { after } from "next/server";
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { postResponseUrl, openModal, updateModal } from "@/lib/slack/client";
import { parseSlackEOD } from "@/lib/redmine/parser";
import { decryptApiKey } from "@/lib/redmine/encryption";
import { decryptToken } from "@/lib/slack/encryption";
import { createTimeEntry, getTimeEntries } from "@/lib/redmine/client";
import {
  buildTimeLogModal,
  buildSubmittingView,
  buildSuccessView,
  formatForRedmine,
} from "@/lib/slack/modal";
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
  const { data } = await supabase
    .from("users")
    .select(
      "id, slack_bot_token_encrypted, slack_bot_token_iv, slack_bot_token_tag"
    )
    .eq("slack_user_id", slackUserId)
    .eq("slack_team_id", slackTeamId)
    .single();
  return data;
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

  if (!dbUser.slack_bot_token_encrypted) {
    await postResponseUrl(response_url, {
      text: `Please reconnect your Slack account at <${APP_URL}/settings/integrations/slack|Settings → Integrations → Slack> to enable the new modal flow.`,
    });
    return new Response(null, { status: 200 });
  }

  const botToken = decryptToken(
    dbUser.slack_bot_token_encrypted,
    dbUser.slack_bot_token_iv,
    dbUser.slack_bot_token_tag
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
    const { data: dbUser } = await supabase
      .from("users")
      .select("slack_bot_token_encrypted, slack_bot_token_iv, slack_bot_token_tag")
      .eq("id", metadata.userId)
      .single();

    const botToken =
      dbUser?.slack_bot_token_encrypted
        ? decryptToken(
            dbUser.slack_bot_token_encrypted,
            dbUser.slack_bot_token_iv,
            dbUser.slack_bot_token_tag
          )
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

// ─── block_actions: Save as Draft ────────────────────────────────────────────

async function handleSaveDraft(payload: {
  user: { id: string };
  team: { id: string };
  view: {
    id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { selected_date?: string | null; value?: string | null }>> };
  };
}): Promise<Response> {
  const { view } = payload;

  let metadata: ModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata) as ModalMetadata;
  } catch {
    return new Response(null, { status: 200 });
  }

  const viewId = view.id;
  const logDate = getSelectedDate(view.state.values, metadata.date);

  // Extract hours from current state (default to 1 for empty/invalid)
  const hoursMap: Record<number, number> = {};
  for (const entry of metadata.entries) {
    const raw =
      view.state.values[`ticket_${entry.issueId}`]?.[
        `hours_${entry.issueId}`
      ]?.value ?? null;
    const parsed = raw !== null ? parseFloat(raw) : NaN;
    hoursMap[entry.issueId] = isNaN(parsed) || parsed <= 0 ? 1 : parsed;
  }

  after(async () => {
    const supabase = createAdminClient();

    const { data: dbUser } = await supabase
      .from("users")
      .select("slack_bot_token_encrypted, slack_bot_token_iv, slack_bot_token_tag")
      .eq("id", metadata.userId)
      .single();

    const botToken =
      dbUser?.slack_bot_token_encrypted
        ? decryptToken(
            dbUser.slack_bot_token_encrypted,
            dbUser.slack_bot_token_iv,
            dbUser.slack_bot_token_tag
          )
        : null;

    const { data: config } = await supabase
      .from("redmine_configs")
      .select("default_activity_id")
      .eq("user_id", metadata.userId)
      .single();

    const activityId = config?.default_activity_id ?? 0;

    const rows = metadata.entries.map((entry) => ({
      user_id: metadata.userId,
      log_date: logDate,
      issue_id: entry.issueId,
      project_name: null,
      hours: hoursMap[entry.issueId],
      activity_id: activityId,
      activity_name: null,
      comment: formatForRedmine(entry.description) || null,
      status: "draft" as const,
      error_message: null,
    }));

    await supabase.from("time_log_entries").insert(rows);

    if (botToken) {
      await updateModal(botToken, viewId, buildSuccessView(rows.length));
    }
  });

  return new Response(null, { status: 200 });
}

// ─── view_submission: Submit to Redmine ──────────────────────────────────────

async function handleViewSubmission(payload: {
  user: { id: string };
  team: { id: string };
  view: {
    id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { selected_date?: string | null; value?: string | null }>> };
  };
}): Promise<Response> {
  const { view } = payload;

  let metadata: ModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata) as ModalMetadata;
  } catch {
    return new Response(null, { status: 200 });
  }

  const viewId = view.id;
  const logDate = getSelectedDate(view.state.values, metadata.date);

  // Validate hours synchronously so we can respond to Slack within 3 s.
  const hoursMap: Record<number, number> = {};
  let hasError = false;

  for (const entry of metadata.entries) {
    const raw =
      view.state.values[`ticket_${entry.issueId}`]?.[
        `hours_${entry.issueId}`
      ]?.value ?? null;
    const hours = raw !== null ? parseFloat(raw) : NaN;
    if (!raw || isNaN(hours) || hours <= 0) {
      hasError = true;
    } else {
      hoursMap[entry.issueId] = hours;
    }
  }

  // On validation error: replace modal inline with an error banner.
  if (hasError) {
    return jsonResponse({
      response_action: "update",
      view: buildTimeLogModal(metadata.entries, logDate, metadata, {
        errorText: "Enter valid hours (greater than 0) for every ticket.",
      }),
    });
  }

  // Valid — show submitting interstitial immediately; do actual work in after().
  after(async () => {
    const supabase = createAdminClient();

    const { data: dbUser } = await supabase
      .from("users")
      .select("slack_bot_token_encrypted, slack_bot_token_iv, slack_bot_token_tag")
      .eq("id", metadata.userId)
      .single();

    const botToken =
      dbUser?.slack_bot_token_encrypted
        ? decryptToken(
            dbUser.slack_bot_token_encrypted,
            dbUser.slack_bot_token_iv,
            dbUser.slack_bot_token_tag
          )
        : null;

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

    const apiKey = decryptApiKey(
      config.encrypted_api_key,
      config.encryption_iv,
      config.encryption_tag
    );
    const opts = { redmineUrl: config.redmine_url, apiKey };

    let submitted = 0;
    let failed = 0;

    await Promise.all(
      metadata.entries.map(async (entry) => {
        const hours = hoursMap[entry.issueId];
        const result = await createTimeEntry(opts, {
          issue_id: entry.issueId,
          spent_on: logDate,
          hours,
          activity_id: config.default_activity_id,
          comments: formatForRedmine(entry.description),
        });
        if (result.error) {
          failed++;
        } else {
          submitted++;
        }
      })
    );

    const failedPart = failed > 0 ? ` (${failed} failed)` : "";
    await postResponseUrl(metadata.responseUrl, {
      text: `✅ Submitted ${submitted} entr${submitted !== 1 ? "ies" : "y"} to Redmine on ${logDate}${failedPart}.`,
    });

    if (botToken) {
      await updateModal(botToken, viewId, buildSuccessView(submitted));
    }
  });

  return jsonResponse({ response_action: "update", view: buildSubmittingView() });
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
    if (actionId === "save_draft") return handleSaveDraft(payload);
  }

  return new Response(null, { status: 200 });
}
