import type { MeetingAttendeeStatus, MeetingBooking, MeetingStatus } from "@/lib/types";

/**
 * Converts "HH:mm" time string into minutes from midnight (0..1439).
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Converts minutes from midnight into 24-hour "HH:mm" format.
 */
export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Checks if two time intervals overlap.
 * Assumes start < end for each interval.
 */
export function isTimeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  return aStart < bEnd && aEnd > bStart;
}

export interface ExistingMeetingTime {
  id?: string;
  start_time: string;
  end_time: string;
  status: MeetingStatus | string;
  title?: string;
}

/**
 * Checks if a proposed meeting collides with any existing scheduled or in-progress meetings.
 */
export function checkMeetingCollision(
  proposedStart: string,
  proposedEnd: string,
  existingMeetings: ExistingMeetingTime[],
  ignoreBookingId?: string
): { hasConflict: boolean; conflictingMeeting?: ExistingMeetingTime } {
  const startMin = timeToMinutes(proposedStart);
  const endMin = timeToMinutes(proposedEnd);

  if (endMin <= startMin) {
    return { hasConflict: true };
  }

  for (const meeting of existingMeetings) {
    if (ignoreBookingId && meeting.id === ignoreBookingId) continue;
    // Only active meetings block the room
    if (meeting.status !== "scheduled" && meeting.status !== "in_progress") continue;

    if (isTimeOverlapping(proposedStart, proposedEnd, meeting.start_time, meeting.end_time)) {
      return { hasConflict: true, conflictingMeeting: meeting };
    }
  }

  return { hasConflict: false };
}

export interface LeaveRecord {
  user_id: string;
  leave_type: string;
  leave_date: string;
  duration?: string;
  status: string;
}

// Half-day cutoff: leaves with duration "half_am" cover before this minute,
// "half_pm" cover from this minute onward. Matches the app's AM/PM labeling
// (see HALF_DAY_TYPES in leave-types.ts); there's no other numeric boundary
// defined elsewhere in the codebase, so 13:00 (after a 12-1pm lunch) is used.
const HALF_DAY_CUTOFF_MINUTES = 13 * 60;

/**
 * Determines whether an attendee is in-office, joining virtually via Slack Huddle (WFH),
 * or unavailable (on leave) during a specific meeting time window, based on their approved
 * leaves for the date. A half-day leave only affects the half of the day it covers.
 */
export function resolveAttendeeStatus(
  userId: string,
  dateStr: string,
  leaves: LeaveRecord[],
  meetingStartTime: string
): MeetingAttendeeStatus {
  const meetingStartMinutes = timeToMinutes(meetingStartTime);

  const userLeaves = leaves.filter((l) => {
    if (l.user_id !== userId || l.leave_date !== dateStr || l.status !== "approved") {
      return false;
    }
    if (l.duration === "half_am") return meetingStartMinutes < HALF_DAY_CUTOFF_MINUTES;
    if (l.duration === "half_pm") return meetingStartMinutes >= HALF_DAY_CUTOFF_MINUTES;
    return true; // whole-day leave (or duration not provided) covers the full day
  });

  if (userLeaves.length === 0) {
    return "in_office";
  }

  // Check for WFH
  const hasWfh = userLeaves.some((l) => l.leave_type === "WFH");
  if (hasWfh) {
    return "virtual";
  }

  // Any other approved leave (VL, SL, BL, etc.) means they are off / on leave
  return "on_leave";
}

/**
 * Calculates current room availability and active/upcoming meetings, purely from
 * the current time-of-day (minutes since midnight) — status alone never pins the
 * room "occupied": a booking that outlived its end_time and hasn't been marked
 * completed yet is treated as no longer current.
 */
export function getLiveRoomStatus(
  currentMinutes: number,
  todayBookings: MeetingBooking[]
): {
  isOccupied: boolean;
  currentMeeting: MeetingBooking | null;
  nextMeeting: MeetingBooking | null;
  availableUntil: string | null;
} {
  const activeBookings = todayBookings
    .filter((b) => b.status === "scheduled" || b.status === "in_progress")
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  // Find meeting that is currently happening
  const current = activeBookings.find((b) => {
    const start = timeToMinutes(b.start_time);
    const end = timeToMinutes(b.end_time);
    return currentMinutes >= start && currentMinutes < end;
  }) || null;

  if (current) {
    return {
      isOccupied: true,
      currentMeeting: current,
      nextMeeting: null,
      availableUntil: null,
    };
  }

  // Find the next meeting scheduled later today
  const next = activeBookings.find((b) => timeToMinutes(b.start_time) > currentMinutes) || null;

  return {
    isOccupied: false,
    currentMeeting: null,
    nextMeeting: next,
    availableUntil: next ? next.start_time : "End of day",
  };
}
