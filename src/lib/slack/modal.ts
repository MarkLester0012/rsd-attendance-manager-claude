// private_metadata is capped at 3 000 chars by Slack — safe for ~15 typical tickets.
export interface ModalMetadata {
  userId: string;
  date: string;
  responseUrl: string;
  entries: Array<{ issueId: number; description: string }>;
}

// Trims each line for clean display in Slack's context blocks.
// Preserves bullet characters (•) and newlines so Slack renders them as-is.
function cleanForDisplay(description: string): string {
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

// Converts bullet lines to Redmine Textile list format (* item).
// Single-line descriptions are returned as plain text (no bullet prefix needed).
// "• Assist in task\n• Assist in this" → "* Assist in task\n* Assist in this"
export function formatForRedmine(description: string): string {
  if (!description.trim()) return "";

  const lines = description
    .split("\n")
    .map((line) => line.replace(/^[\s•\-*–▪◦]+/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];

  return lines.map((line) => `* ${line}`).join("\n");
}

export function buildTimeLogModal(
  entries: ModalMetadata["entries"],
  date: string,
  metadata: ModalMetadata
): object {
  const blocks: object[] = [];

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Date: *${date}*  |  ${entries.length} ticket${entries.length !== 1 ? "s" : ""} found`,
      },
    ],
  });

  blocks.push({ type: "divider" });

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

  blocks.push({
    type: "actions",
    block_id: "modal_actions",
    elements: [
      {
        type: "button",
        action_id: "save_draft",
        text: { type: "plain_text", text: "Save as Draft" },
        style: "primary",
      },
    ],
  });

  return {
    type: "modal",
    callback_id: "log_eod_to_time_logger",
    title: { type: "plain_text", text: "Log EOD to Redmine" },
    submit: { type: "plain_text", text: "Submit to Redmine" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify(metadata),
    blocks,
  };
}

export function buildSuccessView(count: number): object {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Saved" },
    close: { type: "plain_text", text: "Close" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Saved ${count} draft${count !== 1 ? "s" : ""}. Open Time Logger to review.`,
        },
      },
    ],
  };
}
