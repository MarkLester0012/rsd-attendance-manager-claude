import type { MeetingAttendeeStatus, MeetingBooking, User } from "@/lib/types";

export interface AttendeeWithStatus {
  user: User;
  status: MeetingAttendeeStatus;
}

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

/**
 * Builds the Slack Block Kit payload posted to the channel when a meeting starts.
 */
export function buildMeetingStartBlockKit(
  meeting: MeetingBooking,
  organizer: User,
  attendees: AttendeeWithStatus[],
  appUrl: string
): object[] {
  const channelName = meeting.slack_channel || "rsd-leader-team";
  const channelRef = channelName.startsWith("#") ? channelName : `#${channelName}`;
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const description = meeting.description
    ? truncate(escapeSlackText(meeting.description), SECTION_TEXT_MAX)
    : null;

  const inOffice = attendees.filter((a) => a.status === "in_office");
  const virtual = attendees.filter((a) => a.status === "virtual");
  const onLeave = attendees.filter((a) => a.status === "on_leave");

  const formatUserTag = (u: User) =>
    u.slack_user_id ? `<@${u.slack_user_id}>` : escapeSlackText(u.name);

  const inOfficeText =
    inOffice.length > 0 ? inOffice.map((a) => formatUserTag(a.user)).join(", ") : "_None_";

  const virtualText =
    virtual.length > 0
      ? virtual.map((a) => `${formatUserTag(a.user)} _(Slack Huddle)_`).join(", ")
      : "_None_";

  const onLeaveText =
    onLeave.length > 0 ? onLeave.map((a) => `${formatUserTag(a.user)} _(On Leave)_`).join(", ") : "";

  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚪 Meeting Room In Use",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n⏰ *Time:* ${meeting.start_time} – ${meeting.end_time} | 👤 *Organizer:* ${formatUserTag(organizer)}`,
      },
    },
  ];

  if (description) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📝 _${description}_`,
        },
      ],
    });
  }

  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*🏢 In-Office (Meeting Room):*\n${inOfficeText}`,
      },
      {
        type: "mrkdwn",
        text: `*💻 Virtual Attendees:*\n${virtualText}`,
      },
    ],
  });

  if (onLeaveText) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🏖️ *Unavailable:* ${onLeaveText}`,
        },
      ],
    });
  }

  // WFH Slack Huddle notice
  if (virtual.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `💡 *Notice:* Virtual attendees please connect to the *Slack Huddle* in *${channelRef}*.`,
      },
    });
  }

  // Action button linking to the specific meeting in the web app
  const meetingUrl = `${appUrl}/meeting-room?date=${meeting.meeting_date}&meeting=${meeting.id}`;
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "View in App",
          emoji: true,
        },
        url: meetingUrl,
        style: "primary",
      },
    ],
  });

  return blocks;
}

/**
 * Builds personalized DM blocks for attendees.
 */
export function buildMeetingDM(
  meeting: MeetingBooking,
  status: MeetingAttendeeStatus,
  appUrl: string
): { text: string; blocks: object[] } {
  const channelName = meeting.slack_channel || "rsd-leader-team";
  const channelRef = channelName.startsWith("#") ? channelName : `#${channelName}`;
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const meetingUrl = `${appUrl}/meeting-room?date=${meeting.meeting_date}&meeting=${meeting.id}`;

  if (status === "on_leave") {
    const text = `🏖️ FYI: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}) is starting now. You're marked on leave today, so no action is needed — this is just a courtesy heads-up in case plans changed.`;
    const blocks: object[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🏖️ Meeting Starting Now (FYI)",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `The meeting *"${title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).\n\nYou're marked *on leave* today, so this is just a courtesy notice — no action needed unless your plans changed.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Open Meeting Room",
              emoji: true,
            },
            url: meetingUrl,
          },
        ],
      },
    ];
    return { text, blocks };
  }

  if (status === "virtual") {
    const text = `💻 Meeting Starting: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}). Please join via Slack Huddle in ${channelRef}.`;
    const blocks: object[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "💻 Meeting Starting Now",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `The meeting *"${title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).\n\n🏠 Since you are *Working From Home* today, please join via the *Slack Huddle* in *${channelRef}*.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Open Meeting Room",
              emoji: true,
            },
            url: meetingUrl,
            style: "primary",
          },
        ],
      },
    ];
    return { text, blocks };
  }

  // In-Office
  const text = `🏢 Meeting Starting: "${meeting.title}" (${meeting.start_time} - ${meeting.end_time}). Please head to the Meeting Room.`;
  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🏢 Meeting Starting Now",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The meeting *"${title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).\n\n🚶 Please proceed to the *Meeting Room*.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open Meeting Room",
            emoji: true,
          },
          url: meetingUrl,
          style: "primary",
        },
      ],
    },
  ];
  return { text, blocks };
}

/**
 * Builds cancellation broadcast blocks.
 */
export function buildMeetingCancelledBlockKit(
  meeting: MeetingBooking,
  cancelledByName: string,
  appUrl: string
): object[] {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const cancelledBy = escapeSlackText(cancelledByName);
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "❌ Meeting Cancelled",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*"${title}"*\nScheduled for ${meeting.meeting_date} (${meeting.start_time} – ${meeting.end_time}) was cancelled by *${cancelledBy}*.\n\n🟢 The Meeting Room is now free for this time slot.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Book Room",
            emoji: true,
          },
          url: `${appUrl}/meeting-room`,
        },
      ],
    },
  ];
}

/**
 * Builds schedule list blocks for /meeting-room Slack command response.
 */
export function buildScheduleBlockKit(
  dateStr: string,
  bookings: (MeetingBooking & { organizer?: User })[],
  appUrl: string
): object[] {
  const activeBookings = bookings
    .filter((b) => b.status === "scheduled" || b.status === "in_progress")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📅 Meeting Room Schedule (${dateStr})`,
        emoji: true,
      },
    },
  ];

  if (activeBookings.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🟢 *The Meeting Room is completely free!* No meetings are currently scheduled for this date.",
      },
    });
  } else {
    const listItems = activeBookings.map((b) => {
      const statusIcon = b.status === "in_progress" ? "🔴 *[IN USE]*" : "⏳";
      const orgName = b.organizer?.name ? escapeSlackText(b.organizer.name) : "Unknown";
      const title = truncate(escapeSlackText(b.title), 200);
      return `${statusIcon} *${b.start_time} – ${b.end_time}*: *${title}* (by ${orgName})`;
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: listItems.join("\n\n"),
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open Web App",
          emoji: true,
        },
        url: `${appUrl}/meeting-room`,
        style: "primary",
      },
    ],
  });

  return blocks;
}

/**
 * Builds a DM sent by an organizer/leader to a meeting's attendees (the
 * "Message attendees" action).
 */
export function buildAttendeeMessageDM(
  meeting: MeetingBooking,
  fromName: string,
  message: string,
  appUrl: string
): { text: string; blocks: object[] } {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const from = escapeSlackText(fromName);
  const body = truncate(escapeSlackText(message), SECTION_TEXT_MAX - 200);
  const meetingUrl = `${appUrl}/meeting-room?date=${meeting.meeting_date}&meeting=${meeting.id}`;
  const text = `💬 Message about "${meeting.title}" from ${fromName}: ${message}`;

  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "💬 Message about your meeting",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Re: *"${title}"* (${meeting.start_time} – ${meeting.end_time})\nFrom *${from}*:\n\n${body}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open Meeting Room",
            emoji: true,
          },
          url: meetingUrl,
        },
      ],
    },
  ];

  return { text, blocks };
}
