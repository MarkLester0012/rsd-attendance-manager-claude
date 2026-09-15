import { describe, it, expect } from "vitest";
import { buildScheduleBlockKit } from "./meetings";
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

    expect(message.text).toContain('🔴 In Use: "Tech Sync" until 10:00.');
    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("🔴 *In Use*");
    expect(jsonBlocks).toContain("Tech Sync");
    expect(jsonBlocks).toContain("until 10:00");
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

    expect(message.text).toContain("🟢 Available until 14:00.");
    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("🟢 *Available* — free until 14:00, then \\\"Design Review\\\"");
  });

  it("renders Available — no further meetings when room is free and nothing left", () => {
    const liveStatus = {
      isOccupied: false,
      currentMeeting: null,
      nextMeeting: null,
      availableUntil: "End of day",
    };

    const message = buildScheduleBlockKit("2026-09-15", [], appUrl, liveStatus);

    expect(message.text).toContain("🟢 Available.");
    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).toContain("🟢 *Available* — no further meetings today");
    expect(jsonBlocks).toContain("The Meeting Room is completely free");
  });

  it("omits the live status section for a non-today date", () => {
    // liveStatus is undefined for non-today dates
    const message = buildScheduleBlockKit("2026-12-25", [mockBooking1], appUrl, undefined);

    expect(message.text).not.toContain("In Use");
    expect(message.text).not.toContain("Available");
    expect(message.text).toBe("Meeting Room Schedule for 2026-12-25: 1 meeting.");

    const jsonBlocks = JSON.stringify(message.blocks);
    expect(jsonBlocks).not.toContain("🔴 *In Use*");
    expect(jsonBlocks).not.toContain("🟢 *Available*");
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
});
