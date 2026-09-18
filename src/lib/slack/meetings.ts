import { format, parseISO, isValid } from "date-fns";
import type { MeetingAttendeeStatus, MeetingBooking, User } from "@/lib/types";
import { timeToMinutes, type getLiveRoomStatus } from "@/lib/utils/meeting-conflicts";
import { OFFICE_TZ } from "@/lib/utils/office-time";

const DEFAULT_CHANNEL = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";

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
  // Same colors as booked/cancelled, named for their own use: buildScheduleBlockKit
  // colors its accent bar by live room status instead of the fixed 'updated' amber,
  // so occupied/free reads from the bar itself rather than a 🔴/🟢 in the text.
  available: "#2eb67d",
  occupied: "#e01e5a",
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

// 2 fields, not 3 — Slack lays fields out 2-per-row, so a 3rd field (Organizer)
// used to strand itself alone on its own row. Combining Date+Time keeps this
// to one clean row everywhere it's used (Booked/Invited/Updated DMs).
function dateTimeFields(meeting: MeetingBooking, organizer: User): object {
  return {
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Date & Time:*\n${formatMeetingDate(meeting.meeting_date)} · ${meeting.start_time} – ${meeting.end_time}`,
      },
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

function formatMeetingDate(dateStr: string): string {
  try {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) return dateStr;
    return format(parsed, "EEEE, MMM d");
  } catch {
    return dateStr;
  }
}

/**
 * Shared block body for the two booking-confirmation DMs below (organizer's
 * own confirmation and each attendee's invite) — title, date/time/organizer,
 * an attendees list that excludes the organizer (who already has their own
 * line right above), and the optional description. Each caller supplies only
 * its own header text and fallback `text` string, since that's the one thing
 * that legitimately differs between "you booked this" and "you're invited."
 */
function meetingConfirmationBlocks(
  meeting: MeetingBooking,
  organizer: User,
  attendees: User[],
  appUrl: string
): object[] {
  const title = truncate(escapeSlackText(meeting.title), HEADER_TEXT_MAX);
  const description = meeting.description
    ? truncate(escapeSlackText(meeting.description), SECTION_TEXT_MAX)
    : null;
  const others = attendees.filter((u) => u.id !== organizer.id);

  const blocks: object[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
    dateTimeFields(meeting, organizer),
  ];

  // Omit the line entirely for a solo booking rather than printing "Attendees: None".
  if (others.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Attendees:* ${others.map(formatUserTag).join(", ")}` }],
    });
  }

  if (description) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `>${description}` },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push(viewInAppButton("View in App", appUrl, meeting, true));
  return blocks;
}

/**
 * Builds the DM sent to the organizer confirming their own booking.
 */
export function buildMeetingBookedBlockKit(
  meeting: MeetingBooking,
  organizer: User,
  attendees: User[],
  appUrl: string
): SlackMessage {
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Booked", emoji: false } },
    ...meetingConfirmationBlocks(meeting, organizer, attendees, appUrl),
  ];

  return {
    text: `Meeting Booked: "${meeting.title}" on ${formatMeetingDate(meeting.meeting_date)} (${meeting.start_time} - ${meeting.end_time})`,
    blocks,
    color: MEETING_COLORS.booked,
  };
}

/**
 * Builds the DM sent to each attendee (excluding the organizer) when a
 * meeting is booked — same body as buildMeetingBookedBlockKit, different
 * header and fallback text.
 */
export function buildMeetingInvitedDM(
  meeting: MeetingBooking,
  organizer: User,
  attendees: User[],
  appUrl: string
): SlackMessage {
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Invitation", emoji: false } },
    ...meetingConfirmationBlocks(meeting, organizer, attendees, appUrl),
  ];

  return {
    text: `Meeting Invitation: "${meeting.title}" on ${formatMeetingDate(meeting.meeting_date)} (${meeting.start_time} - ${meeting.end_time}), organized by ${organizer.name}`,
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
  const channelName = meeting.slack_channel || DEFAULT_CHANNEL;
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
  const channelName = meeting.slack_channel || DEFAULT_CHANNEL;
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
 * Builds a short, low-key DM sent to organizers of that day's other, later
 * meetings when an earlier meeting is extended. This is a courtesy heads-up,
 * never a warning: extendMeeting()'s collision check already guarantees an
 * extension can't overlap a later meeting's start time, so the recipient's
 * own booking is always unaffected by definition — the copy says so plainly
 * rather than implying any risk to their slot.
 */
export function buildMeetingExtendedNoticeDM(
  extendedMeeting: MeetingBooking,
  organizer: User,
  appUrl: string
): SlackMessage {
  const title = truncate(escapeSlackText(extendedMeeting.title), HEADER_TEXT_MAX);

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "Meeting Room Update", emoji: false } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*"${title}"* (organized by ${formatUserTag(organizer)}) has been extended to *${extendedMeeting.end_time}*.`,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Your meeting today is unaffected — just a heads-up." }],
    },
    { type: "divider" },
    viewInAppButton("View in App", appUrl, extendedMeeting),
  ];

  return {
    text: `Meeting Room Update: "${extendedMeeting.title}" extended to ${extendedMeeting.end_time} — your meeting today is unaffected.`,
    blocks,
    color: MEETING_COLORS.updated,
  };
}

function formatOfficeTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: OFFICE_TZ,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const hour = String(Number(map.hour) % 24).padStart(2, "0");
    const minute = String(Number(map.minute)).padStart(2, "0");
    return `${hour}:${minute}`;
  } catch {
    return "";
  }
}

/**
 * Derives completion status detail for a completed meeting. "Extended" is
 * read directly off `was_extended` rather than inferred from comparing
 * ended_at to end_time: extendMeeting() mutates end_time in place, so by the
 * time a genuinely-extended meeting completes, ended_at naturally lands close
 * to that (already-extended) end_time — a time-diff comparison alone can
 * never actually detect it, and would instead misfire "Extended" for a
 * normal meeting the 15-minute auto-complete cron tick happened to catch a
 * bit late.
 */
export function getCompletionStatus(booking: MeetingBooking): string {
  if (booking.was_extended) {
    return `[Extended to ${booking.end_time}]`;
  }

  if (!booking.ended_at) {
    return "[Completed]";
  }

  const endedTime = formatOfficeTime(booking.ended_at);
  if (!endedTime) {
    return "[Completed]";
  }

  const diff = timeToMinutes(endedTime) - timeToMinutes(booking.end_time);
  return diff < -1 ? `[Ended early at ${endedTime}]` : "[Completed on time]";
}

/**
 * Builds schedule list blocks for /meeting-room Slack command response.
 */
export function buildScheduleBlockKit(
  dateStr: string,
  bookings: (MeetingBooking & { organizer?: User })[],
  appUrl: string,
  liveStatus?: ReturnType<typeof getLiveRoomStatus>
): SlackMessage {
  const activeBookings = bookings
    .filter((b) => b.status === "scheduled" || b.status === "in_progress")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const completedBookings = bookings
    .filter((b) => b.status === "completed")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Status is conveyed by the message's accent bar color (green = available,
  // red = occupied) rather than a 🔴/🟢 in the text, so the status line itself
  // stays to just the boundary time — title/organizer/channel for the current
  // meeting are never restated here since the list below already shows them.
  let statusLine = "";
  let statusLeadText = "";
  let color: string = MEETING_COLORS.updated;

  if (liveStatus) {
    if (liveStatus.isOccupied && liveStatus.currentMeeting) {
      const endTime = liveStatus.currentMeeting.end_time;
      statusLine = `*In Use* until ${endTime}`;
      statusLeadText = `In Use until ${endTime}`;
      color = MEETING_COLORS.occupied;
    } else if (liveStatus.nextMeeting) {
      statusLine = `*Available* until ${liveStatus.availableUntil}`;
      statusLeadText = `Available until ${liveStatus.availableUntil}`;
      color = MEETING_COLORS.available;
    } else {
      statusLine = "*Available* — free for the rest of the day";
      statusLeadText = "Available";
      color = MEETING_COLORS.available;
    }
  }

  const titleText =
    `*Meeting Room — ${formatMeetingDate(dateStr)}*` + (statusLine ? `\n${statusLine}` : "");

  const blocks: object[] = [{ type: "section", text: { type: "mrkdwn", text: titleText } }];

  // Body content is built separately so an empty body (today, zero bookings —
  // the status line above already says "Available") adds no extra blocks or
  // dividers, instead of a redundant "completely free" paragraph right under
  // a status line that just said the same thing.
  const bodyBlocks: object[] = [];

  if (activeBookings.length === 0 && completedBookings.length === 0) {
    if (!liveStatus) {
      bodyBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*The Meeting Room is completely free.* No meetings are currently scheduled for this date.",
        },
      });
    }
  } else {
    if (activeBookings.length > 0) {
      const listItems = activeBookings.map((b) => {
        const statusLabel = b.status === "in_progress" ? " — *In Progress*" : "";
        const orgName = b.organizer?.name ? escapeSlackText(b.organizer.name) : "Unknown";
        const title = truncate(escapeSlackText(b.title), 200);
        const channelTag = b.notify_channel ? ` · #${b.slack_channel || DEFAULT_CHANNEL}` : "";
        return `>*${b.start_time} – ${b.end_time}* — *${title}* (by ${orgName})${channelTag}${statusLabel}`;
      });

      bodyBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: listItems.join("\n") },
      });
    } else {
      bodyBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*No upcoming meetings scheduled for this date.*",
        },
      });
    }

    if (completedBookings.length > 0) {
      bodyBlocks.push({ type: "divider" });
      // Demoted to a context element (vs. a bold section) — same information,
      // less visual weight than the upcoming list above it.
      bodyBlocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: "*Past Meetings Today*" }],
      });

      const completedItems = completedBookings.map((b) => {
        const orgName = b.organizer?.name ? escapeSlackText(b.organizer.name) : "Unknown";
        const title = truncate(escapeSlackText(b.title), 200);
        const channelTag = b.notify_channel ? ` · #${b.slack_channel || DEFAULT_CHANNEL}` : "";
        const statusDetail = getCompletionStatus(b);
        return `>~*${b.start_time} – ${b.end_time}* — *${title}* (by ${orgName})~${channelTag} · ${statusDetail}`;
      });

      bodyBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: completedItems.join("\n") },
      });
    }
  }

  if (bodyBlocks.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push(...bodyBlocks);
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

  let countSummary = "";
  if (activeBookings.length > 0 && completedBookings.length > 0) {
    countSummary = `${activeBookings.length} upcoming, ${completedBookings.length} past.`;
  } else if (activeBookings.length > 0) {
    countSummary = `${activeBookings.length} meeting${activeBookings.length === 1 ? "" : "s"}.`;
  } else if (completedBookings.length > 0) {
    countSummary = `${completedBookings.length} past meeting${completedBookings.length === 1 ? "" : "s"}.`;
  } else {
    countSummary = "0 meetings.";
  }

  const text = statusLeadText
    ? `${statusLeadText} — ${dateStr}: ${countSummary}`
    : `Meeting Room Schedule for ${dateStr}: ${countSummary}`;

  return { text, blocks, color };
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
