import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  isTimeOverlapping,
  checkMeetingCollision,
  resolveAttendeeStatus,
  findApplicableLeave,
  getLiveRoomStatus,
  isBookingInThePast,
  isWithinStartWindow,
  getChainedAvailableUntil,
  formatDuration,
  formatMinutesAsDuration,
  formatRelativeMinutes,
  nearestSlotFromFraction,
  floorSlotFromFraction,
  isStartTimeBooked,
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

describe("formatDuration & formatMinutesAsDuration", () => {
  it("formats a whole-hour duration", () => {
    expect(formatDuration("09:00", "10:00")).toBe("1h 0m");
  });

  it("formats an hour-and-minutes duration", () => {
    expect(formatDuration("09:00", "10:30")).toBe("1h 30m");
  });

  it("formats a minutes-only duration", () => {
    expect(formatDuration("09:00", "09:45")).toBe("0h 45m");
  });

  it("formats a raw minute count", () => {
    expect(formatMinutesAsDuration(90)).toBe("1h 30m");
  });
});

describe("formatRelativeMinutes", () => {
  it("formats under an hour as plain minutes", () => {
    expect(formatRelativeMinutes(5)).toBe("5 min");
    expect(formatRelativeMinutes(59)).toBe("59 min");
  });

  it("formats an hour or more as Xh Ym", () => {
    expect(formatRelativeMinutes(60)).toBe("1h 0m");
    expect(formatRelativeMinutes(245)).toBe("4h 5m");
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

  it("resolves to virtual when user has approved Extended WFH (EWFH)", () => {
    const status = resolveAttendeeStatus(
      "u1",
      "2026-09-04",
      [{ user_id: "u1", leave_type: "EWFH", leave_date: "2026-09-04", status: "approved" }],
      "14:00"
    );
    expect(status).toBe("virtual");
  });

  it("handles a split day of SL (AM) + EWFH (PM) per half", () => {
    const leaves = [
      { user_id: "u1", leave_type: "SL", leave_date: "2026-09-04", duration: "half_am", status: "approved" },
      { user_id: "u1", leave_type: "EWFH", leave_date: "2026-09-04", duration: "half_pm", status: "approved" },
    ];
    expect(resolveAttendeeStatus("u1", "2026-09-04", leaves, "09:00")).toBe("on_leave");
    expect(resolveAttendeeStatus("u1", "2026-09-04", leaves, "15:00")).toBe("virtual");
  });
});

describe("findApplicableLeave", () => {
  it("prefers the WFH half when a split day pairs it with a non-WFH half", () => {
    // half_am VL (covers AM) + half_pm WFH (covers PM) — a PM meeting should
    // resolve to the WFH record, not just "the first leave for the date".
    const leaves = [
      { user_id: "u1", leave_type: "VL", leave_date: "2026-09-04", duration: "half_am", status: "approved" },
      { user_id: "u1", leave_type: "WFH", leave_date: "2026-09-04", duration: "half_pm", status: "approved" },
    ];
    const leave = findApplicableLeave("u1", "2026-09-04", leaves, "15:00");
    expect(leave?.leave_type).toBe("WFH");
  });

  it("returns the AM half for an AM meeting on the same split day", () => {
    const leaves = [
      { user_id: "u1", leave_type: "VL", leave_date: "2026-09-04", duration: "half_am", status: "approved" },
      { user_id: "u1", leave_type: "WFH", leave_date: "2026-09-04", duration: "half_pm", status: "approved" },
    ];
    const leave = findApplicableLeave("u1", "2026-09-04", leaves, "09:00");
    expect(leave?.leave_type).toBe("VL");
  });

  it("returns undefined when no leave applies", () => {
    expect(findApplicableLeave("u1", "2026-09-04", [], "09:00")).toBeUndefined();
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
    was_extended: false,
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

  it("reports an in_progress meeting started early as occupied before its scheduled start_time", () => {
    // Started at 13:50 for a 14:00-15:00 meeting — status is already
    // in_progress, so it must count as current even though currentMinutes
    // hasn't reached start_time yet.
    const startedEarly: MeetingBooking = {
      ...dummyMeeting,
      status: "in_progress",
      started_at: "2026-09-04T05:50:00Z",
    };
    const status = getLiveRoomStatus(13 * 60 + 55, [startedEarly]); // 13:55
    expect(status.isOccupied).toBe(true);
    expect(status.currentMeeting?.title).toBe("Leadership Sync");
  });
});

describe("isWithinStartWindow", () => {
  const today = "2026-09-16";

  it("is false on a different date, even within the time window", () => {
    expect(isWithinStartWindow("2026-09-17", "14:00", "15:00", today, 14 * 60)).toBe(false);
  });

  it("is false more than 15 minutes before start_time", () => {
    expect(isWithinStartWindow(today, "14:00", "15:00", today, 13 * 60 + 44)).toBe(false);
  });

  it("is true exactly 15 minutes before start_time", () => {
    expect(isWithinStartWindow(today, "14:00", "15:00", today, 13 * 60 + 45)).toBe(true);
  });

  it("is true while the meeting is ongoing", () => {
    expect(isWithinStartWindow(today, "14:00", "15:00", today, 14 * 60 + 30)).toBe(true);
  });

  it("is false at or after end_time", () => {
    expect(isWithinStartWindow(today, "14:00", "15:00", today, 15 * 60)).toBe(false);
  });
});

describe("getChainedAvailableUntil", () => {
  const base: MeetingBooking = {
    id: "b1",
    title: "First",
    description: null,
    organizer_id: "u1",
    meeting_date: "2026-09-04",
    start_time: "09:00",
    end_time: "10:00",
    status: "scheduled",
    notify_channel: true,
    slack_channel: "rsd-leader-team",
    slack_message_ts: null,
    started_at: null,
    ended_at: null,
    was_extended: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("returns the meeting's own end_time when it's the only booking", () => {
    expect(getChainedAvailableUntil(base, [base])).toBe("10:00");
  });

  it("chains through a back-to-back meeting that starts exactly when this one ends", () => {
    const next: MeetingBooking = { ...base, id: "b2", title: "Second", start_time: "10:00", end_time: "11:00" };
    expect(getChainedAvailableUntil(base, [base, next])).toBe("11:00");
  });

  it("chains through several back-to-back meetings to the end of the last one", () => {
    const next: MeetingBooking = { ...base, id: "b2", title: "Second", start_time: "10:00", end_time: "11:00" };
    const third: MeetingBooking = { ...base, id: "b3", title: "Third", start_time: "11:00", end_time: "11:30" };
    expect(getChainedAvailableUntil(base, [base, next, third])).toBe("11:30");
  });

  it("stops at the meeting's own end_time when the next booking has a gap", () => {
    const later: MeetingBooking = { ...base, id: "b2", title: "Later", start_time: "10:30", end_time: "11:00" };
    expect(getChainedAvailableUntil(base, [base, later])).toBe("10:00");
  });

  it("ignores a cancelled booking inside what would otherwise be the chain", () => {
    const cancelled: MeetingBooking = {
      ...base,
      id: "b2",
      title: "Cancelled",
      start_time: "10:00",
      end_time: "11:00",
      status: "cancelled",
    };
    expect(getChainedAvailableUntil(base, [base, cancelled])).toBe("10:00");
  });
});

describe("isBookingInThePast", () => {
  const today = "2026-09-16";
  const nowMinutes = 14 * 60; // 14:00

  it("is true for any time on an earlier date", () => {
    expect(isBookingInThePast("2026-09-15", "23:45", today, nowMinutes)).toBe(true);
  });

  it("is false for any time on a later date, regardless of how early", () => {
    expect(isBookingInThePast("2026-09-17", "00:00", today, nowMinutes)).toBe(false);
  });

  it("is true for today with a start time before the current minute", () => {
    expect(isBookingInThePast(today, "09:00", today, nowMinutes)).toBe(true);
  });

  it("is false for today at exactly the current minute", () => {
    expect(isBookingInThePast(today, "14:00", today, nowMinutes)).toBe(false);
  });

  it("is false for today with a start time after the current minute", () => {
    expect(isBookingInThePast(today, "15:00", today, nowMinutes)).toBe(false);
  });
});

describe("nearestSlotFromFraction & floorSlotFromFraction", () => {
  const startHour = 7;
  const endHour = 20;

  it("nearest: clamps fraction 0 to the first slot", () => {
    expect(nearestSlotFromFraction(0, startHour, endHour)).toBe("07:00");
  });

  it("nearest: clamps fraction 1 to the last start slot, not the closing hour", () => {
    expect(nearestSlotFromFraction(1, startHour, endHour)).toBe("19:30");
  });

  it("nearest: rounds down just before the halfway point of a slot", () => {
    // 07:14 into the day -> 434 min -> nearest 30 is 420 (07:00)
    const fraction = (7 * 60 + 14 - startHour * 60) / ((endHour - startHour) * 60);
    expect(nearestSlotFromFraction(fraction, startHour, endHour)).toBe("07:00");
  });

  it("nearest: rounds up at the halfway point of a slot", () => {
    // 07:15 into the day -> 435 min -> nearest 30 is 450 (07:30)
    const fraction = (7 * 60 + 15 - startHour * 60) / ((endHour - startHour) * 60);
    expect(nearestSlotFromFraction(fraction, startHour, endHour)).toBe("07:30");
  });

  it("nearest: clamps out-of-range fractions", () => {
    expect(nearestSlotFromFraction(-0.5, startHour, endHour)).toBe("07:00");
    expect(nearestSlotFromFraction(1.5, startHour, endHour)).toBe("19:30");
  });

  it("floor: rounds down to the slot at or before the fraction", () => {
    const fraction = (10 * 60 + 45 - startHour * 60) / ((endHour - startHour) * 60);
    expect(floorSlotFromFraction(fraction, startHour, endHour)).toBe("10:30");
  });

  it("floor: clamps fraction 1 to the last start slot", () => {
    expect(floorSlotFromFraction(1, startHour, endHour)).toBe("19:30");
  });
});

describe("isStartTimeBooked", () => {
  const existing = [
    { id: "m1", start_time: "10:00", end_time: "11:00", status: "scheduled", title: "Sync" },
    { id: "m2", start_time: "16:00", end_time: "17:00", status: "cancelled", title: "Cancelled" },
  ];

  it("is true for a slot inside a booking", () => {
    expect(isStartTimeBooked("10:30", existing)).toBe(true);
  });

  it("is false for a slot starting exactly at a booking's end", () => {
    expect(isStartTimeBooked("11:00", existing)).toBe(false);
  });

  it("is false for a slot ending exactly at a booking's start", () => {
    expect(isStartTimeBooked("09:30", existing)).toBe(false);
  });

  it("ignores the booking passed as ignoreBookingId", () => {
    expect(isStartTimeBooked("10:00", existing, "m1")).toBe(false);
  });

  it("ignores cancelled/completed bookings", () => {
    expect(isStartTimeBooked("16:00", existing)).toBe(false);
  });

  it("is true for an extended booking ending on a :15/:45 boundary", () => {
    const extended = [
      { id: "m3", start_time: "09:00", end_time: "10:15", status: "in_progress", title: "Extended" },
    ];
    expect(isStartTimeBooked("10:00", extended)).toBe(true);
    expect(isStartTimeBooked("10:15", extended)).toBe(false);
  });
});
