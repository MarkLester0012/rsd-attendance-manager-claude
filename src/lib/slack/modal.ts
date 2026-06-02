// private_metadata is capped at 3 000 chars by Slack — safe for ~15 typical tickets.
export interface ModalMetadata {
  userId: string;
  date: string;
  responseUrl: string;
  entries: Array<{ issueId: number; description: string }>;
}

const WORKDAY_HOURS = 8;

// Trims each line for clean display in Slack's context blocks.
// Preserves bullet characters (•) and newlines so Slack renders them as-is.
function cleanForDisplay(description: string): string {
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

// Normalises all bullet variants (-, *, –, ▪, ◦) to • and preserves newlines.
// Redmine time entry comments are plain text — no Textile/Markdown rendering.
// Using • with \n gives the best result:
//   - Redmine that preserves newlines → multi-line bullet list
//   - Redmine that collapses newlines → "• item • item" which is still readable
// Single-line descriptions are returned as plain text (no bullet prefix added).
export function formatForRedmine(description: string): string {
  if (!description.trim()) return "";

  const lines = description
    .split("\n")
    .map((line) => line.replace(/^[\s•\-*–▪◦]+/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];

  return lines.map((line) => `• ${line}`).join("\n");
}

interface BuildModalOpts {
  /** Total hours already logged to Redmine for this date. null = still loading. */
  loggedHours?: number | null;
  /** Validation / error message to show near the top of the modal. */
  errorText?: string;
}

export function buildTimeLogModal(
  entries: ModalMetadata["entries"],
  date: string,
  metadata: ModalMetadata,
  opts: BuildModalOpts = {}
): object {
  const { loggedHours, errorText } = opts;
  const blocks: object[] = [];

  // ── Date picker ──────────────────────────────────────────────────────────
  blocks.push({
    type: "input",
    block_id: "date_block",
    dispatch_action: true,
    label: { type: "plain_text", text: "Date" },
    element: {
      type: "datepicker",
      action_id: "date_select",
      initial_date: date,
    },
  });

  // ── Logged-hours baseline ─────────────────────────────────────────────────
  const loggedText =
    loggedHours != null
      ? `Logged on ${date}: *${loggedHours}h* / ${WORKDAY_HOURS}h`
      : `Logged on ${date}: _loading…_`;

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${loggedText}  |  ${entries.length} ticket${entries.length !== 1 ? "s" : ""} found`,
      },
    ],
  });

  // ── Error banner (hand-rolled validation feedback) ────────────────────────
  if (errorText) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `⚠️ ${errorText}` }],
    });
  }

  blocks.push({ type: "divider" });

  // ── Ticket entry rows ─────────────────────────────────────────────────────
  entries.forEach((entry, index) => {
    const display = cleanForDisplay(entry.description);

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*#${entry.issueId}*` },
    });

    if (display) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: display }],
      });
    }

    blocks.push({
      type: "input",
      block_id: `ticket_${entry.issueId}`,
      label: { type: "plain_text", text: "Hours" },
      element: {
        type: "number_input",
        action_id: `hours_${entry.issueId}`,
        is_decimal_allowed: true,
        min_value: "0.1",
        placeholder: { type: "plain_text", text: "e.g. 2.5" },
      },
    });

    if (index < entries.length - 1) {
      blocks.push({ type: "divider" });
    }
  });

  // ── Action buttons side by side ───────────────────────────────────────────
  blocks.push({
    type: "actions",
    block_id: "modal_actions",
    elements: [
      {
        type: "button",
        action_id: "save_draft",
        text: { type: "plain_text", text: "Save as Draft" },
      },
      {
        type: "button",
        action_id: "submit_to_redmine",
        style: "primary",
        text: { type: "plain_text", text: "Submit to Redmine" },
      },
    ],
  });

  return {
    type: "modal",
    callback_id: "log_eod_to_time_logger",
    title: { type: "plain_text", text: "Log EOD to Redmine" },
    private_metadata: JSON.stringify(metadata),
    blocks,
  };
}

