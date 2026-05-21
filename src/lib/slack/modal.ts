// private_metadata is capped at 3 000 chars by Slack — safe for ~15 typical tickets.
export interface ModalMetadata {
  userId: string;
  date: string;
  responseUrl: string;
  entries: Array<{ issueId: number; description: string }>;
}

export function buildTimeLogModal(
  entries: ModalMetadata["entries"],
  date: string,
  metadata: ModalMetadata
): object {
  const header = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Date:* ${date} | ${entries.length} ticket(s) parsed`,
    },
  };

  const ticketBlocks = entries.flatMap((entry) => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*#${entry.issueId}*${entry.description ? ` — ${entry.description}` : ""}`,
      },
    },
    {
      type: "input",
      block_id: `ticket_${entry.issueId}`,
      label: { type: "plain_text", text: `Hours for #${entry.issueId}` },
      element: {
        type: "number_input",
        action_id: `hours_${entry.issueId}`,
        is_decimal_allowed: true,
        min_value: "0.1",
        placeholder: { type: "plain_text", text: "e.g. 2.5" },
      },
    },
  ]);

  const saveDraftAction = {
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
  };

  return {
    type: "modal",
    callback_id: "log_eod_to_time_logger",
    title: { type: "plain_text", text: "Log EOD to Redmine" },
    submit: { type: "plain_text", text: "Submit to Redmine" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify(metadata),
    blocks: [header, { type: "divider" }, ...ticketBlocks, saveDraftAction],
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
          text: `:white_check_mark: Saved ${count} draft${count !== 1 ? "s" : ""}. Open Time Logger to review.`,
        },
      },
    ],
  };
}
