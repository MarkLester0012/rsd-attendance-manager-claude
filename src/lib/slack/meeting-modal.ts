// private_metadata is capped at 3 000 chars by Slack — a single user id fits
// with plenty of room to spare.
export interface BookMeetingModalMetadata {
  organizerId: string;
}

// Standard 30-min time slots from 07:00 to 20:00 — matches TIME_OPTIONS in
// meeting-room/book-meeting-modal.tsx (the web app's equivalent picker).
export const MEETING_TIME_OPTIONS: string[] = Array.from({ length: 27 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

function timeOptionBlocks(options: string[]) {
  return options.map((t) => ({
    text: { type: "plain_text" as const, text: t },
    value: t,
  }));
}

/**
 * Builds the Block Kit modal for `/meeting-room book`. Submission is handled
 * by the `book_meeting_room` view_submission branch in shortcut/route.ts.
 */
export function buildBookMeetingModal(
  defaultDateStr: string,
  metadata: BookMeetingModalMetadata,
  defaultStartTime = "09:00",
  defaultEndTime = "10:00"
): object {
  const timeOptions = timeOptionBlocks(MEETING_TIME_OPTIONS);
  const defaultStartOption = timeOptions.find((o) => o.value === defaultStartTime) ?? timeOptions[4];
  const defaultEndOption = timeOptions.find((o) => o.value === defaultEndTime) ?? timeOptions[6];

  const blocks: object[] = [
    {
      type: "input",
      block_id: "title_block",
      label: { type: "plain_text", text: "Meeting Title" },
      element: {
        type: "plain_text_input",
        action_id: "title_input",
        placeholder: { type: "plain_text", text: "e.g. Weekly Tech Sync" },
      },
    },
    {
      type: "input",
      block_id: "description_block",
      optional: true,
      label: { type: "plain_text", text: "Description / Agenda (optional)" },
      element: {
        type: "plain_text_input",
        action_id: "description_input",
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "date_block",
      label: { type: "plain_text", text: "Date" },
      element: {
        type: "datepicker",
        action_id: "date_select",
        initial_date: defaultDateStr,
      },
    },
    {
      type: "input",
      block_id: "start_time_block",
      label: { type: "plain_text", text: "Start Time" },
      element: {
        type: "static_select",
        action_id: "start_time_select",
        options: timeOptions,
        initial_option: defaultStartOption,
      },
    },
    {
      type: "input",
      block_id: "end_time_block",
      label: { type: "plain_text", text: "End Time" },
      element: {
        type: "static_select",
        action_id: "end_time_select",
        options: timeOptions,
        initial_option: defaultEndOption,
      },
    },
    {
      type: "input",
      block_id: "attendees_block",
      optional: true,
      label: { type: "plain_text", text: "Attendees" },
      element: {
        type: "multi_users_select",
        action_id: "attendees_select",
        placeholder: { type: "plain_text", text: "Select attendees (optional)" },
      },
    },
    {
      type: "input",
      block_id: "notify_channel_block",
      optional: true,
      label: { type: "plain_text", text: "Notifications" },
      element: {
        type: "checkboxes",
        action_id: "notify_channel_checkbox",
        options: [
          {
            text: { type: "plain_text", text: "Notify the meeting room channel" },
            value: "notify_channel",
          },
        ],
        initial_options: [
          {
            text: { type: "plain_text", text: "Notify the meeting room channel" },
            value: "notify_channel",
          },
        ],
      },
    },
  ];

  return {
    type: "modal",
    callback_id: "book_meeting_room",
    title: { type: "plain_text", text: "Book Meeting Room" },
    // Slack rejects views.open with `invalid_arguments` unless a modal that
    // contains input blocks also defines a `submit` button.
    submit: { type: "plain_text", text: "Book Room" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify(metadata satisfies BookMeetingModalMetadata),
    blocks,
  };
}
