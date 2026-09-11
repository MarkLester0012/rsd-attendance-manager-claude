import type { MeetingAttendeeStatus, MeetingBooking, User } from "@/lib/types";

export interface AttendeeWithStatus {
  user: User;
  status: MeetingAttendeeStatus;
}

/** Every meeting Slack message returns this shape — see `postChatMessage`. */
export interface SlackMessage {
  text: string;
  blocks: object[];
  color: string;
}

/** Slack's own palette, reused as the `attachments[].color` bar per event type. */
export const MEETING_COLORS = {
  booked: "#2eb67d",
  starting: "#2eb67d",
  updated: "#ecb22e",
  cancelled: "#e01e5a",
  message: "#4a154b",
} as const;

/**
 * Escapes Slack mrkdwn special characters in user-supplied text (meeting titles,
 * descriptions). Without this, a title like "<!channel>" or "<@U123>" is
 * interpreted by Slack as a real mention/broadcast, not literal text.
 * See: https://api.slack.com/reference/surfaces/formatting#escaping
 */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Truncates text to Slack's block text limits, appending an ellipsis when cut. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

const SECTION_TEXT_MAX = 3000;
const HEADER_TEXT_MAX = 150;

/** Renders a Slack mention when linked, else the escaped display name. */
export function formatUserTag(u: User): string {
  return u.slack_user_id ? `<@${u.slack_user_id}>` : escapeSlackText(u.name);
}

function dateTimeFields(meeting: MeetingBooking, organizer: User): object {
  return {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Date:*\n${meeting.meeting_date}` },
      { type: "mrkdwn", text: `*Time:*\n${meeting.start_time} – ${meeting.end_time}` },
      { type: "mrkdwn", text: `*Organizer:*\n${formatUserTag(organizer)}` },
    ],
  };
}

function viewInAppButton(text: string, appUrl: string, meeting: MeetingBooking, primary = false): object {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text, emoji: false },
        url: `${appUrl}/meeting-room?date=${meeting.meeting_date}&meeting=${meeting.id}`,
        ...(primary ? { style: "primary" } : {}),
      },
    ],
  };
}

/**
 * Builds the Slack Block Kit payload posted to the channel when a meeting is
 * first booked.
 */
export function buildMeetingBookedBlockKit(
  meeting: MeetingBooking,
  organizer: User,
  attendees: User[],
  appUrl: string
): SlackMessage {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const description = meeting.description
    ? truncate(escapeSlackText(meeting.description), SECTION_TEXT_MAX)
    : null;
  const others = attendees.filter((u) => u.id !== organizer.id);
  const attendeeText = others.length > 0 ? others.map(formatUserTag).join(", ") : "_None_";

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Booked", emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
    dateTimeFields(meeting, organizer),
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Attendees:* ${attendeeText}` }],
    },
  ];

  if (description) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${description}_` }],
    });
  }

  blocks.push({ type: "divider" });
  blocks.push(viewInAppButton("View in App", appUrl, meeting, true));

  return {
    text: `Meeting Booked: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}) by ${organizer.name}`,
    blocks,
    color: MEETING_COLORS.booked,
  };
}

/**
 * Builds the Slack Block Kit payload posted when a scheduled meeting is
 * edited (time, title, description, or attendees changed).
 */
export function buildMeetingUpdatedBlockKit(
  meeting: MeetingBooking,
  organizer: User,
  updatedByName: string,
  changes: string[],
  appUrl: string
): SlackMessage {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const updatedBy = escapeSlackText(updatedByName);

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Updated", emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
    dateTimeFields(meeting, organizer),
  ];

  if (changes.length > 0) {
    const changeText = changes.map((c) => escapeSlackText(c)).join("\n");
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Changed by ${updatedBy}:*\n${changeText}` }],
    });
  } else {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Updated by *${updatedBy}*.` }],
    });
  }

  blocks.push({ type: "divider" });
  blocks.push(viewInAppButton("View in App", appUrl, meeting, true));

  return {
    text: `Meeting Updated: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}) by ${updatedByName}`,
    blocks,
    color: MEETING_COLORS.updated,
  };
}

/**
 * Builds the Slack Block Kit payload posted to the channel when a meeting starts.
 */
export function buildMeetingStartBlockKit(
  meeting: MeetingBooking,
  organizer: User,
  attendees: AttendeeWithStatus[],
  appUrl: string
): SlackMessage {
  const channelName = meeting.slack_channel || "rsd-leader-team";
  const channelRef = channelName.startsWith("#") ? channelName : `#${channelName}`;
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const description = meeting.description
    ? truncate(escapeSlackText(meeting.description), SECTION_TEXT_MAX)
    : null;

  const inOffice = attendees.filter((a) => a.status === "in_office");
  const virtual = attendees.filter((a) => a.status === "virtual");
  const onLeave = attendees.filter((a) => a.status === "on_leave");

  const inOfficeText =
    inOffice.length > 0 ? inOffice.map((a) => formatUserTag(a.user)).join(", ") : "_None_";

  const virtualText =
    virtual.length > 0
      ? virtual.map((a) => `${formatUserTag(a.user)} _(Slack Huddle)_`).join(", ")
      : "_None_";

  const onLeaveText =
    onLeave.length > 0 ? onLeave.map((a) => `${formatUserTag(a.user)} _(On Leave)_`).join(", ") : "";

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Room In Use", emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
    dateTimeFields(meeting, organizer),
  ];

  if (description) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${description}_` }],
    });
  }

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*In-Office (Meeting Room):*\n${inOfficeText}` },
      { type: "mrkdwn", text: `*Virtual Attendees:*\n${virtualText}` },
    ],
  });

  if (onLeaveText) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Unavailable:* ${onLeaveText}` }],
    });
  }

  // WFH Slack Huddle notice
  if (virtual.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Virtual attendees, please connect to the Slack Huddle in *${channelRef}*.`,
      },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push(viewInAppButton("View in App", appUrl, meeting, true));

  return {
    text: `Meeting Starting Now: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time})`,
    blocks,
    color: MEETING_COLORS.starting,
  };
}

/**
 * Builds personalized DM blocks for attendees.
 */
export function buildMeetingDM(
  meeting: MeetingBooking,
  organizer: User,
  status: MeetingAttendeeStatus,
  appUrl: string
): SlackMessage {
  const channelName = meeting.slack_channel || "rsd-leader-team";
  const channelRef = channelName.startsWith("#") ? channelName : `#${channelName}`;
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);

  const organizerField = { type: "mrkdwn", text: `*Organizer:* ${formatUserTag(organizer)}` };

  if (status === "on_leave") {
    const text = `FYI: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}) is starting now. You're marked on leave today, so no action is needed — this is just a courtesy heads-up in case plans changed.`;
    const blocks: object[] = [
      { type: "header", text: { type: "plain_text", text: "Meeting Starting Now (FYI)", emoji: false } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `The meeting *"${title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).`,
        },
      },
      { type: "context", elements: [organizerField] },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "You're marked *on leave* today, so this is just a courtesy notice — no action needed unless your plans changed.",
          },
        ],
      },
      viewInAppButton("Open Meeting Room", appUrl, meeting),
    ];
    return { text, blocks, color: MEETING_COLORS.starting };
  }

  if (status === "virtual") {
    const text = `Meeting Starting: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}). Please join via Slack Huddle in ${channelRef}.`;
    const blocks: object[] = [
      { type: "header", text: { type: "plain_text", text: "Meeting Starting Now", emoji: false } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `The meeting *"${title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).`,
        },
      },
      { type: "context", elements: [organizerField] },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Since you are *Working From Home* today, please join via the Slack Huddle in *${channelRef}*.`,
          },
        ],
      },
      viewInAppButton("Open Meeting Room", appUrl, meeting, true),
    ];
    return { text, blocks, color: MEETING_COLORS.starting };
  }

  // In-Office
  const text = `Meeting Starting: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}). Please head to the Meeting Room.`;
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Starting Now", emoji: false } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The meeting *"${title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).`,
      },
    },
    { type: "context", elements: [organizerField] },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Please proceed to the Meeting Room." }],
    },
    viewInAppButton("Open Meeting Room", appUrl, meeting, true),
  ];
  return { text, blocks, color: MEETING_COLORS.starting };
}

/**
 * Builds cancellation broadcast blocks.
 */
export function buildMeetingCancelledBlockKit(
  meeting: MeetingBooking,
  organizer: User,
  cancelledByName: string,
  appUrl: string
): SlackMessage {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const cancelledBy = escapeSlackText(cancelledByName);

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Cancelled", emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Date:*\n${meeting.meeting_date}` },
        { type: "mrkdwn", text: `*Time:*\n${meeting.start_time} – ${meeting.end_time}` },
        { type: "mrkdwn", text: `*Organizer:*\n${formatUserTag(organizer)}` },
      ],
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Cancelled by:* ${cancelledBy}. The Meeting Room is now free for this time slot.` },
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Book Room", emoji: false },
          url: `${appUrl}/meeting-room`,
        },
      ],
    },
  ];

  return {
    text: `Meeting Cancelled: "${meeting.title}" by ${cancelledByName}`,
    blocks,
    color: MEETING_COLORS.cancelled,
  };
}

/**
 * Builds schedule list blocks for /meeting-room Slack command response.
 */
export function buildScheduleBlockKit(
  dateStr: string,
  bookings: (MeetingBooking & { organizer?: User })[],
  appUrl: string
): SlackMessage {
  const activeBookings = bookings
    .filter((b) => b.status === "scheduled" || b.status === "in_progress")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Meeting Room Schedule (${dateStr})`, emoji: false },
    },
  ];

  if (activeBookings.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*The Meeting Room is completely free.* No meetings are currently scheduled for this date.",
      },
    });
  } else {
    const listItems = activeBookings.map((b) => {
      const statusLabel = b.status === "in_progress" ? " — *In Progress*" : "";
      const orgName = b.organizer?.name ? escapeSlackText(b.organizer.name) : "Unknown";
      const title = truncate(escapeSlackText(b.title), 200);
      return `>*${b.start_time} – ${b.end_time}* — *${title}* (by ${orgName})${statusLabel}`;
    });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: listItems.join("\n") },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open Web App", emoji: false },
        url: `${appUrl}/meeting-room`,
        style: "primary",
      },
    ],
  });

  const activeCount = activeBookings.length;
  return {
    text: `Meeting Room Schedule for ${dateStr}: ${activeCount} meeting${activeCount === 1 ? "" : "s"}.`,
    blocks,
    color: MEETING_COLORS.updated,
  };
}

/**
 * Builds a DM sent by an organizer/leader to a meeting's attendees (the
 * "Message attendees" action).
 */
export function buildAttendeeMessageDM(
  meeting: MeetingBooking,
  organizer: User,
  fromName: string,
  message: string,
  appUrl: string
): SlackMessage {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const from = escapeSlackText(fromName);
  const body = truncate(escapeSlackText(message), SECTION_TEXT_MAX - 200);

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Message about your meeting", emoji: false } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `Re: *"${title}"* (${meeting.start_time} – ${meeting.end_time})` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Organizer:* ${formatUserTag(organizer)}` },
        { type: "mrkdwn", text: `*From:* ${from}` },
      ],
    },
    { type: "section", text: { type: "mrkdwn", text: `>${body}` } },
    { type: "divider" },
    viewInAppButton("Open Meeting Room", appUrl, meeting),
  ];

  return {
    text: `Message about "${meeting.title}" from ${fromName}: ${message}`,
    blocks,
    color: MEETING_COLORS.message,
  };
}

/**
 * Builds a small notice (heading + body) for slash-command guard replies —
 * "not linked", "not authorized", "bot not configured", etc. — so those
 * ephemeral responses read as structured notices rather than bare strings.
 */
export function buildNoticeBlocks(heading: string, body: string): SlackMessage {
  const blocks: object[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${heading}*` },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: body }],
    },
  ];
  return { text: `${heading}: ${body}`, blocks, color: MEETING_COLORS.updated };
}
