import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  isTimeOverlapping,
  checkMeetingCollision,
  resolveAttendeeStatus,
  getLiveRoomStatus,
} from "./meeting-conflicts";
import type { MeetingBooking } from "@/lib/types";

describe("timeToMinutes & minutesToTime", () => {
  it("converts HH:mm to minutes and back", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("14:30")).toBe(870);
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(870)).toBe("14:30");
  });
});

describe("isTimeOverlapping", () => {
  it("detects direct overlap", () => {
    // 14:00 - 15:00 and 14:30 - 15:30
    expect(isTimeOverlapping("14:00", "15:00", "14:30", "15:30")).toBe(true);
  });

  it("detects enclosure overlap", () => {
    // 13:00 - 16:00 and 14:00 - 15:00
    expect(isTimeOverlapping("13:00", "16:00", "14:00", "15:00")).toBe(true);
  });

  it("allows adjacent/back-to-back bookings (end time equals start time)", () => {
    // 14:00 - 15:00 and 15:00 - 16:00 do NOT overlap
    expect(isTimeOverlapping("14:00", "15:00", "15:00", "16:00")).toBe(false);
  });

  it("does not overlap when disjoint", () => {
    expect(isTimeOverlapping("10:00", "11:00", "14:00", "15:00")).toBe(false);
  });
});

describe("checkMeetingCollision", () => {
  const existing = [
    { id: "m1", start_time: "10:00", end_time: "11:00", status: "scheduled", title: "Sync" },
    { id: "m2", start_time: "14:00", end_time: "15:00", status: "scheduled", title: "Design Review" },
    { id: "m3", start_time: "16:00", end_time: "17:00", status: "cancelled", title: "Cancelled" },
  ];

  it("blocks booking that collides with an active meeting", () => {
    const result = checkMeetingCollision("10:30", "11:30", existing);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingMeeting?.title).toBe("Sync");
  });

  it("allows booking that does not collide", () => {
    const result = checkMeetingCollision("11:00", "12:00", existing);
    expect(result.hasConflict).toBe(false);
  });

  it("ignores cancelled meetings", () => {
    const result = checkMeetingCollision("16:00", "17:00", existing);
    expect(result.hasConflict).toBe(false);
  });

  it("ignores the meeting being edited when ignoreBookingId is provided", () => {
    const result = checkMeetingCollision("10:00", "11:30", existing, "m1");
    expect(result.hasConflict).toBe(false);
  });

  it("rejects invalid end_time <= start_time", () => {
    const result = checkMeetingCollision("15:00", "14:00", existing);
    expect(result.hasConflict).toBe(true);
  });
});

describe("resolveAttendeeStatus", () => {
  it("resolves to in_office when user has no leaves", () => {
    const status = resolveAttendeeStatus("u1", "2026-09-04", [], "14:00");
    expect(status).toBe("in_office");
  });

  it("resolves to virtual when user has approved WFH", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [{ user_id: "u1", leave_type: "WFH", leave_date: "2026-09-04", status: "approved" }],
      "14:00"
    );
    expect(status).toBe("virtual");
  });

  it("resolves to on_leave when user has approved BL or VL or SL", () => {
    const blStatus = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [{ user_id: "u1", leave_type: "BL", leave_date: "2026-09-04", status: "approved" }],
      "14:00"
    );
    expect(blStatus).toBe("on_leave");

    const vlStatus = resolveAttendeeStatus(
      "u2",
      "2026-09-04",
      [{ user_id: "u2", leave_type: "VL", leave_date: "2026-09-04", status: "approved" }],
      "14:00"
    );
    expect(vlStatus).toBe("on_leave");
  });

  it("ignores unapproved/pending leaves", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [{ user_id: "u1", leave_type: "VL", leave_date: "2026-09-04", status: "pending" }],
      "14:00"
    );
    expect(status).toBe("in_office");
  });

  it("a half_am leave does not affect a PM meeting", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [
        {
          user_id: "u1",
          leave_type: "VL",
          leave_date: "2026-09-04",
          duration: "half_am",
          status: "approved",
        },
      ],
      "15:00"
    );
    expect(status).toBe("in_office");
  });

  it("a half_am leave does affect an AM meeting", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [
        {
          user_id: "u1",
          leave_type: "VL",
          leave_date: "2026-09-04",
          duration: "half_am",
          status: "approved",
        },
      ],
      "09:00"
    );
    expect(status).toBe("on_leave");
  });

  it("a half_pm WFH leave does not make an AM meeting virtual", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [
        {
          user_id: "u1",
          leave_type: "WFH",
          leave_date: "2026-09-04",
          duration: "half_pm",
          status: "approved",
        },
      ],
      "09:00"
    );
    expect(status).toBe("in_office");
  });

  it("a half_pm WFH leave does make a PM meeting virtual", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [
        {
          user_id: "u1",
          leave_type: "WFH",
          leave_date: "2026-09-04",
          duration: "half_pm",
          status: "approved",
        },
      ],
      "15:00"
    );
    expect(status).toBe("virtual");
  });
});

describe("getLiveRoomStatus", () => {
  const dummyMeeting: MeetingBooking = {
    id: "b1",
    title: "Leadership Sync",
    description: null,
    organizer_id: "u1",
    meeting_date: "2026-09-04",
    start_time: "14:00",
    end_time: "15:00",
    status: "scheduled",
    notify_channel: true,
    slack_channel: "rsd-leader-team",
    slack_message_ts: null,
    started_at: null,
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("shows occupied when current time falls within meeting hours", () => {
    const status = getLiveRoomStatus(14 * 60 + 30, [dummyMeeting]); // 14:30
    expect(status.isOccupied).toBe(true);
    expect(status.currentMeeting?.title).toBe("Leadership Sync");
  });

  it("shows available when before the meeting, and reports it as the next meeting", () => {
    const status = getLiveRoomStatus(10 * 60, [dummyMeeting]); // 10:00
    expect(status.isOccupied).toBe(false);
    expect(status.availableUntil).toBe("14:00");
    expect(status.nextMeeting?.title).toBe("Leadership Sync");
  });

  it("shows available when after the meeting", () => {
    const status = getLiveRoomStatus(15 * 60 + 30, [dummyMeeting]); // 15:30
    expect(status.isOccupied).toBe(false);
    expect(status.availableUntil).toBe("End of day");
  });

  it("shows exactly at start_time as occupied and exactly at end_time as free", () => {
    expect(getLiveRoomStatus(14 * 60, [dummyMeeting]).isOccupied).toBe(true); // 14:00
    expect(getLiveRoomStatus(15 * 60, [dummyMeeting]).isOccupied).toBe(false); // 15:00
  });

  it("does not report a stale in_progress meeting as occupied once its end_time has passed", () => {
    const stale: MeetingBooking = { ...dummyMeeting, status: "in_progress" };
    const status = getLiveRoomStatus(16 * 60, [stale]); // 16:00, an hour after end_time
    expect(status.isOccupied).toBe(false);
    expect(status.currentMeeting).toBe(null);
  });

  it("reports an in_progress meeting as occupied while still within its time window", () => {
    const inProgress: MeetingBooking = { ...dummyMeeting, status: "in_progress" };
    const status = getLiveRoomStatus(14 * 60 + 30, [inProgress]); // 14:30
    expect(status.isOccupied).toBe(true);
    expect(status.currentMeeting?.title).toBe("Leadership Sync");
  });
});
