import type { MeetingAttendeeStatus, MeetingBooking, User } from "@/lib/types";

export interface AttendeeWithStatus {
  user: User;
  status: MeetingAttendeeStatus;
}

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

  const inOffice = attendees.filter((a) => a.status === "in_office");
  const virtual = attendees.filter((a) => a.status === "virtual");
  const onLeave = attendees.filter((a) => a.status === "on_leave");

  const formatUserTag = (u: User) => (u.slack_user_id ? `<@${u.slack_user_id}>` : u.name);

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
        text: `*${meeting.title}*\n⏰ *Time:* ${meeting.start_time} – ${meeting.end_time} | 👤 *Organizer:* ${formatUserTag(organizer)}`,
      },
    },
  ];

  if (meeting.description) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📝 _${meeting.description}_`,
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

  // Action button linking to web app
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
        url: `${appUrl}/meeting-room`,
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
          text: `The meeting *"${meeting.title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).\n\n🏠 Since you are *Working From Home* today, please join via the *Slack Huddle* in *${channelRef}*.`,
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
            url: `${appUrl}/meeting-room`,
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
        text: `The meeting *"${meeting.title}"* is starting now (${meeting.start_time} – ${meeting.end_time}).\n\n🚶 Please proceed to the *Meeting Room*.`,
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
          url: `${appUrl}/meeting-room`,
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
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `❌ *Meeting Cancelled: "${meeting.title}"*\nScheduled for ${meeting.meeting_date} (${meeting.start_time} – ${meeting.end_time}) was cancelled by *${cancelledByName}*.\n\n🟢 The Meeting Room is now free for this time slot.`,
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
        text: "🟢 *The Meeting Room is completely free today!* No meetings are currently scheduled.",
      },
    });
  } else {
    const listItems = activeBookings.map((b) => {
      const statusIcon = b.status === "in_progress" ? "🔴 *[IN USE]*" : "⏳";
      const orgName = b.organizer?.name || "Unknown";
      return `${statusIcon} *${b.start_time} – ${b.end_time}*: *${b.title}* (by ${orgName})`;
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
