import { after } from "next/server";
import type { NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { postResponseUrl, openModal, updateModal, getWorkspaceBotToken } from "@/lib/slack/client";
import { parseSlackEOD } from "@/lib/redmine/parser";
import { decryptApiKey } from "@/lib/redmine/encryption";
import { decryptToken } from "@/lib/slack/encryption";
import { createTimeEntry, getTimeEntries } from "@/lib/redmine/client";
import { buildTimeLogModal, formatForRedmine } from "@/lib/slack/modal";
import type { ModalMetadata } from "@/lib/slack/modal";
import { buildScheduleBlockKit } from "@/lib/slack/meetings";
import { buildBookMeetingModal, type BookMeetingModalMetadata } from "@/lib/slack/meeting-modal";
import { createBookingCore, VALID_TIME } from "@/lib/meetings/create-booking";
import { timeToMinutes } from "@/lib/utils/meeting-conflicts";
import { officeDateString } from "@/lib/utils/office-time";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Server-only var (not NEXT_PUBLIC_) so it resolves at request time rather than
// being inlined at build time — see APP_URL note in meeting-room/actions.ts.
const APP_URL = process.env.APP_URL || "http://localhost:3000";
if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
  console.error("APP_URL is not set — Slack links in this route will point at localhost.");
}
const DEFAULT_CHANNEL = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";

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

/**
 * Resolves the Slack user issuing a meeting-room command/interaction back to
 * an app user, via the same slack_user_id + slack_team_id link used by
 * lookupUser() above. Used to identify the caller for the meeting-room
 * schedule and book commands, neither of which go through lookupUser()
 * itself since they don't need the caller's decrypted Slack OAuth token.
 */
async function resolveMeetingRoomCaller(slackUserId: string, slackTeamId: string) {
  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("slack_user_id", slackUserId)
    .eq("slack_team_id", slackTeamId)
    .single();
  return user ?? null;
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

const CONNECT_SLACK_TEXT = `Connect your Slack account at <${APP_URL}/settings/integrations/slack|Settings → Integrations → Slack> to use this command.`;

async function handleMeetingRoomCommand(params: URLSearchParams): Promise<Response> {
  const slackUserId = params.get("user_id");
  const slackTeamId = params.get("team_id");
  if (!slackUserId || !slackTeamId) {
    return jsonResponse({ response_type: "ephemeral", text: "Something went wrong — please try again." });
  }

  // Require the caller to be a linked app user before revealing any schedule
  // data — titles, descriptions, and organizer names should not be visible to
  // an unlinked Slack account (including single-channel guests).
  const caller = await resolveMeetingRoomCaller(slackUserId, slackTeamId);
  if (!caller) {
    return jsonResponse({ response_type: "ephemeral", text: CONNECT_SLACK_TEXT });
  }

  const text = (params.get("text") || "").trim().toLowerCase();
  const today = officeDateString();
  const targetDate = text.match(/^\d{4}-\d{2}-\d{2}$/) ? text : today;

  const supabase = createAdminClient();
  const { data: bookings, error } = await supabase
    .from("meeting_room_bookings")
    .select("*, organizer:users!meeting_room_bookings_organizer_id_fkey(name, slack_user_id)")
    .eq("meeting_date", targetDate)
    .in("status", ["scheduled", "in_progress"])
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Failed to load meeting room schedule for Slack command:", error.message);
    return jsonResponse({
      response_type: "ephemeral",
      text: "Failed to load the meeting room schedule. Please try again or check the web app.",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = buildScheduleBlockKit(targetDate, (bookings as any) || [], APP_URL);
  return jsonResponse({
    response_type: "ephemeral",
    blocks,
  });
}

async function handleMeetingRoomBookCommand(params: URLSearchParams): Promise<Response> {
  const slackUserId = params.get("user_id");
  const slackTeamId = params.get("team_id");
  const triggerId = params.get("trigger_id");
  if (!slackUserId || !slackTeamId || !triggerId) {
    return jsonResponse({ response_type: "ephemeral", text: "Something went wrong — please try again." });
  }

  const caller = await resolveMeetingRoomCaller(slackUserId, slackTeamId);
  if (!caller) {
    return jsonResponse({ response_type: "ephemeral", text: CONNECT_SLACK_TEXT });
  }
  if (caller.role !== "leader" && caller.role !== "hr") {
    return jsonResponse({
      response_type: "ephemeral",
      text: "Only leaders and HR can book the meeting room.",
    });
  }

  const botToken = await getWorkspaceBotToken();
  if (!botToken) {
    return jsonResponse({
      response_type: "ephemeral",
      text: "The meeting room bot isn't configured yet. Please book from the web app instead.",
    });
  }

  const metadata: BookMeetingModalMetadata = { organizerId: caller.id };
  const modal = buildBookMeetingModal(officeDateString(), metadata);
  const result = await openModal(botToken, triggerId, modal);

  if (!result.ok) {
    return jsonResponse({
      response_type: "ephemeral",
      text: `Failed to open the booking modal: ${result.error ?? "unknown error"}. Please try again.`,
    });
  }

  return new Response(null, { status: 200 });
}

// ─── view_submission: Book meeting room from Slack ───────────────────────────

async function handleBookMeetingSubmission(payload: {
  view: {
    private_metadata: string;
    state: {
      values: Record<
        string,
        Record<
          string,
          {
            value?: string | null;
            selected_date?: string | null;
            selected_option?: { value?: string } | null;
            selected_users?: string[] | null;
            selected_options?: { value?: string }[] | null;
          }
        >
      >;
    };
  };
}): Promise<Response> {
  const { view } = payload;

  let metadata: BookMeetingModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata) as BookMeetingModalMetadata;
  } catch {
    return jsonResponse({ response_action: "clear" });
  }

  const values = view.state.values;
  const title = values.title_block?.title_input?.value?.trim() || "";
  const description = values.description_block?.description_input?.value?.trim() || "";
  const meetingDate = values.date_block?.date_select?.selected_date || officeDateString();
  const startTime = values.start_time_block?.start_time_select?.selected_option?.value || "";
  const endTime = values.end_time_block?.end_time_select?.selected_option?.value || "";
  const selectedSlackUserIds = values.attendees_block?.attendees_select?.selected_users || [];
  const notifyChannel =
    (values.notify_channel_block?.notify_channel_checkbox?.selected_options || []).length > 0;

  // Validate synchronously so Slack shows native inline errors on the
  // relevant block, rather than a generic failure toast.
  const errors: Record<string, string> = {};
  if (!title) {
    errors.title_block = "Meeting title is required.";
  }
  if (!VALID_TIME.test(startTime) || !VALID_TIME.test(endTime)) {
    errors.end_time_block = "Please select both a start and end time.";
  } else if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    errors.end_time_block = "End time must be after start time.";
  }
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ response_action: "errors", errors });
  }

  const supabase = createAdminClient();

  let attendeeIds: string[] = [];
  if (selectedSlackUserIds.length > 0) {
    const { data: attendeeUsers } = await supabase
      .from("users")
      .select("id, slack_user_id")
      .in("slack_user_id", selectedSlackUserIds);
    const resolved = attendeeUsers || [];
    attendeeIds = resolved.map((u) => u.id);
    const unresolvedCount = selectedSlackUserIds.length - resolved.length;
    if (unresolvedCount > 0) {
      console.warn(
        `${unresolvedCount} selected Slack user(s) have no linked app account; excluded from attendees.`
      );
    }
  }

  const result = await createBookingCore(
    supabase,
    metadata.organizerId,
    {
      title,
      description: description || undefined,
      meeting_date: meetingDate,
      start_time: startTime,
      end_time: endTime,
      attendee_ids: attendeeIds,
      notify_channel: notifyChannel,
    },
    DEFAULT_CHANNEL
  );

  if ("error" in result) {
    return jsonResponse({
      response_action: "errors",
      errors: { end_time_block: result.error },
    });
  }

  const { booking, attendeeIds: allAttendeeIds } = result;
  const notifyIds = allAttendeeIds.filter((id) => id !== metadata.organizerId);
  if (notifyIds.length > 0) {
    const { data: organizer } = await supabase
      .from("users")
      .select("name")
      .eq("id", metadata.organizerId)
      .single();
    const organizerName = organizer?.name || "A leader";

    // Session-less admin-client context (no auth.uid()), so this inserts
    // directly rather than going through the create_notifications RPC — see
    // api/cron/meetings/route.ts for the same pattern.
    const { error: notifError } = await supabase.from("notifications").insert(
      notifyIds.map((userId) => ({
        user_id: userId,
        type: "meeting_scheduled",
        title: `Meeting Scheduled: ${booking.title}`,
        body: `${booking.meeting_date} from ${booking.start_time} to ${booking.end_time} by ${organizerName}`,
        data: { booking_id: booking.id, meeting_date: booking.meeting_date },
      }))
    );
    if (notifError) {
      console.error("Failed to notify attendees of Slack-booked meeting:", notifError.message);
    }
  }

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
  const command = params.get("command");
  if (command === "/meeting-room") {
    const text = (params.get("text") || "").trim();
    if (/^book(\s|$)/i.test(text)) {
      return handleMeetingRoomBookCommand(params);
    }
    return handleMeetingRoomCommand(params);
  }

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

  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "book_meeting_room"
  ) {
    return handleBookMeetingSubmission(payload);
  }

  if (payload.type === "block_actions" && Array.isArray(payload.actions)) {
    const actionId = payload.actions[0]?.action_id;
    if (actionId === "date_select") return handleDateChange(payload);
  }

  return new Response(null, { status: 200 });
}
