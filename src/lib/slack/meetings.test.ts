import { describe, it, expect } from "vitest";
import {
  buildScheduleBlockKit,
  buildMeetingBookedBlockKit,
  buildMeetingInvitedDM,
  buildMeetingCancelledBlockKit,
  buildMeetingExtendedNoticeDM,
  getCompletionStatus,
} from "./meetings";
import type { MeetingBooking, User } from "@/lib/types";

const mockOrganizer: User = {
  id: "user-1",
  auth_id: "auth-1",
  name: "Alice Leader",
  username: "alice",
  email: "alice@example.com",
  role: "leader",
  department_id: "dept-1",
  leave_balance: 15,
  slack_user_id: "U12345",
  slack_team_id: "T12345",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockAttendee: User = {
  id: "user-2",
  auth_id: "auth-2",
  name: "Bob Teammate",
  username: "bob",
  email: "bob@example.com",
  role: "member",
  department_id: "dept-1",
  leave_balance: 10,
  slack_user_id: "U67890",
  slack_team_id: "T12345",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockBooking1: MeetingBooking & { organizer: User } = {
  id: "booking-1",
  title: "Tech Sync",
  description: "Weekly sync",
  organizer_id: "user-1",
  meeting_date: "2026-09-15",
  start_time: "09:00",
  end_time: "10:00",
  status: "scheduled",
  notify_channel: true,
  slack_channel: "dev-team",
  slack_message_ts: null,
  started_at: null,
  ended_at: null,
  was_extended: false,
  created_at: "2026-09-15T00:00:00Z",
  updated_at: "2026-09-15T00:00:00Z",
  organizer: mockOrganizer,
};

const mockBooking2: MeetingBooking & { organizer: User } = {
  id: "booking-2",
  title: "Design Review",
  description: null,
  organizer_id: "user-1",
  meeting_date: "2026-09-15",
  start_time: "14:00",
  end_time: "15:00",
  status: "scheduled",
  notify_channel: false,
  slack_channel: "rsd-leader-team",
  slack_message_ts: null,
  started_at: null,
  ended_at: null,
  was_extended: false,
  created_at: "2026-09-15T00:00:00Z",
  updated_at: "2026-09-15T00:00:00Z",
  organizer: mockOrganizer,
};

describe("buildScheduleBlockKit", () => {
  const appUrl = "http://localhost:3000";

  it("renders an In Use status section when room is currently occupied", () => {
    const liveStatus = {
      isOccupied: true,
      currentMeeting: mockBooking1,
      nextMeeting: null,
      availableUntil: null,
    };

    const message = buildScheduleBlockKit("2026-09-15", [mockBooking1], appUrl, liveStatus);

    expect(message.text).toContain("In Use until 10:00");
    expect(message.color).toBe("#e01e5a"); // MEETING_COLORS.occupied — status is color, not emoji
    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("*In Use* until 10:00");
    // Title/organizer/channel are not restated in the status line — only the
    // list below (asserted separately) shows them, so this must appear once.
    expect((jsonBlocks.match(/Tech Sync/g) || []).length).toBe(1);
    expect(jsonBlocks).toContain("Alice Leader");
    expect(jsonBlocks).toContain("#dev-team");
  });

  it("renders an Available status section when room is free and has a next meeting", () => {
    const liveStatus = {
      isOccupied: false,
      currentMeeting: null,
      nextMeeting: mockBooking2,
      availableUntil: "14:00",
    };

    const message = buildScheduleBlockKit("2026-09-15", [mockBooking2], appUrl, liveStatus);

    expect(message.text).toContain("Available until 14:00");
    expect(message.color).toBe("#2eb67d"); // MEETING_COLORS.available
    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("*Available* until 14:00");
    // The next meeting's title isn't repeated in the status line — the list
    // below (asserted in the channel-tag test) is the only place it appears.
    expect(jsonBlocks).not.toContain("then");
  });

  it("renders Available — no further meetings when room is free and nothing left", () => {
    const liveStatus = {
      isOccupied: false,
      currentMeeting: null,
      nextMeeting: null,
      availableUntil: "End of day",
    };

    const message = buildScheduleBlockKit("2026-09-15", [], appUrl, liveStatus);

    expect(message.text).toContain("Available — 2026-09-15: 0 meetings.");
    expect(message.color).toBe("#2eb67d"); // MEETING_COLORS.available
    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("*Available* — free for the rest of the day");
    // The status line already says the room is free — the old separate
    // "completely free" paragraph would have been pure repetition here.
    expect(jsonBlocks).not.toContain("The Meeting Room is completely free");
  });

  it("omits the live status section for a non-today date", () => {
    // liveStatus is undefined for non-today dates
    const message = buildScheduleBlockKit("2026-12-25", [mockBooking1], appUrl, undefined);

    expect(message.text).not.toContain("In Use");
    expect(message.text).not.toContain("Available");
    expect(message.text).toBe("Meeting Room Schedule for 2026-12-25: 1 meeting.");
    expect(message.color).toBe("#ecb22e"); // MEETING_COLORS.updated fallback — no status to color by

    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).not.toContain("*In Use*");
    expect(jsonBlocks).not.toContain("*Available*");
    expect(jsonBlocks).toContain("Tech Sync");
  });

  it("surfaces channel name only when notify_channel is true", () => {
    const message = buildScheduleBlockKit("2026-09-15", [mockBooking1, mockBooking2], appUrl);
    const jsonBlocks = JSON.stringify(message.blocks);

    // mockBooking1 has notify_channel: true and slack_channel: "dev-team"
    expect(jsonBlocks).toContain("#dev-team");
    // mockBooking2 has notify_channel: false
    expect(jsonBlocks).not.toContain("#rsd-leader-team");
  });

  it("renders past completed meetings with completion status in a separate section", () => {
    // 09:00 - 10:00 meeting that ended early at 09:45 (01:45 UTC = 09:45 Manila)
    const completedBooking: MeetingBooking & { organizer: User } = {
      id: "booking-completed-1",
      title: "Morning Standup",
      description: null,
      organizer_id: "user-1",
      meeting_date: "2026-09-15",
      start_time: "09:00",
      end_time: "10:00",
      status: "completed",
      notify_channel: true,
      slack_channel: "dev-team",
      slack_message_ts: null,
      started_at: "2026-09-15T01:00:00Z",
      ended_at: "2026-09-15T01:45:00Z",
      was_extended: false,
      created_at: "2026-09-15T00:00:00Z",
      updated_at: "2026-09-15T01:45:00Z",
      organizer: mockOrganizer,
    };

    const message = buildScheduleBlockKit("2026-09-15", [mockBooking2, completedBooking], appUrl);
    const jsonBlocks = JSON.stringify(message.blocks);

    expect(jsonBlocks).toContain("Past Meetings Today");
    expect(jsonBlocks).toContain("Morning Standup");
    expect(jsonBlocks).toContain("[Ended early at 09:45]");
    expect(jsonBlocks).toContain("~*09:00 – 10:00* — *Morning Standup* (by Alice Leader)~ · #dev-team · [Ended early at 09:45]");
    expect(message.text).toContain("1 upcoming, 1 past.");
  });
});

describe("getCompletionStatus", () => {
  it("detects early completion", () => {
    const booking: MeetingBooking = {
      ...mockBooking1,
      status: "completed",
      // 01:40 UTC = 09:40 Manila (ended 20 mins before 10:00)
      ended_at: "2026-09-15T01:40:00Z",
    };
    expect(getCompletionStatus(booking)).toBe("[Ended early at 09:40]");
  });

  it("detects on-time completion", () => {
    const booking: MeetingBooking = {
      ...mockBooking1,
      status: "completed",
      // 02:00 UTC = 10:00 Manila
      ended_at: "2026-09-15T02:00:00Z",
    };
    expect(getCompletionStatus(booking)).toBe("[Completed on time]");
  });

  it("detects extended completion via the was_extended flag, not a time comparison", () => {
    // end_time is 10:00 because extendMeeting() already mutated it to the new
    // (extended) value — was_extended is the only thing that distinguishes
    // this from a meeting that simply ended on time.
    const booking: MeetingBooking = {
      ...mockBooking1,
      status: "completed",
      was_extended: true,
      ended_at: "2026-09-15T02:00:00Z",
    };
    expect(getCompletionStatus(booking)).toBe("[Extended to 10:00]");
  });

  it("does not misreport a meeting caught a minute late by cron as extended", () => {
    // was_extended: false, ended_at a couple minutes after end_time — this
    // used to spuriously read as "Extended" under the old time-diff logic.
    const booking: MeetingBooking = {
      ...mockBooking1,
      status: "completed",
      was_extended: false,
      // 02:02 UTC = 10:02 Manila, 2 minutes after the 10:00 end_time
      ended_at: "2026-09-15T02:02:00Z",
    };
    expect(getCompletionStatus(booking)).toBe("[Completed on time]");
  });

  it("returns [Completed] when ended_at is missing", () => {
    const booking: MeetingBooking = {
      ...mockBooking1,
      status: "completed",
      ended_at: null,
    };
    expect(getCompletionStatus(booking)).toBe("[Completed]");
  });
});

describe("booking-confirmation DMs", () => {
  const appUrl = "http://localhost:3000";

  it("builds the organizer's own confirmation DM without listing them in Attendees", () => {
    const message = buildMeetingBookedBlockKit(
      mockBooking1,
      mockOrganizer,
      [mockOrganizer, mockAttendee],
      appUrl
    );

    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("Meeting Booked");
    expect(jsonBlocks).toContain("*Tech Sync*");
    expect(jsonBlocks).toContain("Tuesday, Sep 15");
    expect(jsonBlocks).toContain("*Organizer:*\\n<@U12345>");
    // Regression: the organizer already has their own line above — they
    // must not also appear in the Attendees list.
    expect(jsonBlocks).toContain("*Attendees:* <@U67890>");
    expect(jsonBlocks).not.toContain("*Attendees:* <@U12345>");
    expect(jsonBlocks).toContain(">Weekly sync");
  });

  it("builds the attendee invitation DM without a redundant 'you've been invited' line", () => {
    const message = buildMeetingInvitedDM(
      mockBooking1,
      mockOrganizer,
      [mockOrganizer, mockAttendee],
      appUrl
    );

    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("Meeting Invitation");
    expect(jsonBlocks).toContain("*Tech Sync*");
    expect(jsonBlocks).toContain("Tuesday, Sep 15");
    expect(jsonBlocks).toContain("*Organizer:*\\n<@U12345>");
    // Same regression as above: the invite DM must exclude the organizer
    // from its own Attendees list too.
    expect(jsonBlocks).toContain("*Attendees:* <@U67890>");
    expect(jsonBlocks).not.toContain("*Attendees:* <@U12345>");
    expect(jsonBlocks).toContain(">Weekly sync");
    expect(jsonBlocks).not.toContain("You've been invited");
  });
});

describe("buildMeetingCancelledBlockKit", () => {
  const appUrl = "http://localhost:3000";

  it("uses the shared 2-field Date & Time layout instead of a stranded 3rd field", () => {
    const message = buildMeetingCancelledBlockKit(mockBooking1, mockOrganizer, "Alice Leader", appUrl);
    const jsonBlocks = JSON.stringify(message.blocks);

    // dateTimeFields formats the date (e.g. "Tuesday, Sep 15"), not the raw
    // 'yyyy-MM-dd' string the old inline 3-field section printed.
    expect(jsonBlocks).toContain("Tuesday, Sep 15");
    expect(jsonBlocks).not.toContain("2026-09-15");

    const dateTimeSection = (message.blocks as { fields?: object[] }[]).find(
      (b) => Array.isArray((b as { fields?: object[] }).fields)
    ) as { fields: object[] } | undefined;
    expect(dateTimeSection?.fields).toHaveLength(2);
  });
});

describe("buildMeetingExtendedNoticeDM", () => {
  const appUrl = "http://localhost:3000";

  it("tells the recipient their own meeting is unaffected, not at risk", () => {
    const extended: MeetingBooking = { ...mockBooking1, end_time: "10:30", was_extended: true };
    const message = buildMeetingExtendedNoticeDM(extended, mockOrganizer, appUrl);

    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("Tech Sync");
    expect(jsonBlocks).toContain("10:30");
    expect(jsonBlocks).toContain("<@U12345>"); // the extended meeting's organizer
    expect(jsonBlocks).toContain("unaffected");
    expect(message.text).toContain("unaffected");
    expect(message.text).toContain("10:30");
  });
});
