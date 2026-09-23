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
 * True when a proposed meeting_date + start_time is already in the past
 * relative to office "now" — an earlier date outright, or today with a start
 * time before the current minute. A start time equal to the current minute
 * is not "in the past." Takes office today/now as parameters rather than
 * reading the clock itself, matching getLiveRoomStatus's shape below — the
 * same function is reused as-is by server code and by both client modals.
 */
export function isBookingInThePast(
  meetingDate: string,
  startTime: string,
  officeToday: string,
  officeNowMinutes: number
): boolean {
  if (meetingDate < officeToday) return true;
  if (meetingDate > officeToday) return false;
  return timeToMinutes(startTime) < officeNowMinutes;
}

/**
 * Formats a duration in minutes as "Xh Ym" (e.g. 90 -> "1h 30m").
 */
export function formatMinutesAsDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Formats the duration between two "HH:mm" times as "Xh Ym".
 */
export function formatDuration(startTime: string, endTime: string): string {
  return formatMinutesAsDuration(timeToMinutes(endTime) - timeToMinutes(startTime));
}

/**
 * Formats a countdown in minutes for the booking card's "starts in X" / "ends
 * in X" hint: plain minutes below an hour, "Xh Ym" (via formatMinutesAsDuration,
 * which always prints both units) at or above it — so "starts in 245 min"
 * reads as "starts in 4h 5m" instead.
 */
export function formatRelativeMinutes(diffMinutes: number): string {
  if (diffMinutes < 60) return `${diffMinutes} min`;
  return formatMinutesAsDuration(diffMinutes);
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
 * Returns the single approved leave record (if any) that applies to a
 * meeting starting at meetingStartTime, applying the same half-day cutoff
 * resolveAttendeeStatus uses below. When more than one leave applies (e.g. a
 * split day), a WFH leave is preferred, matching resolveAttendeeStatus's own
 * "WFH wins" precedence — so a caller showing details for a single leave
 * (the attendee popover) always shows the one that actually explains the
 * attendee's status pill, not just the first match in insertion order.
 */
export function findApplicableLeave(
  userId: string,
  dateStr: string,
  leaves: LeaveRecord[],
  meetingStartTime: string
): LeaveRecord | undefined {
  const meetingStartMinutes = timeToMinutes(meetingStartTime);

  const applicable = leaves.filter((l) => {
    if (l.user_id !== userId || l.leave_date !== dateStr || l.status !== "approved") {
      return false;
    }
    if (l.duration === "half_am") return meetingStartMinutes < HALF_DAY_CUTOFF_MINUTES;
    if (l.duration === "half_pm") return meetingStartMinutes >= HALF_DAY_CUTOFF_MINUTES;
    return true; // whole-day leave (or duration not provided) covers the full day
  });

  return applicable.find((l) => l.leave_type === "WFH") || applicable[0];
}

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
  const leave = findApplicableLeave(userId, dateStr, leaves, meetingStartTime);
  if (!leave) return "in_office";
  return leave.leave_type === "WFH" ? "virtual" : "on_leave";
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

  // Find meeting that is currently happening. An in_progress meeting counts
  // as current as soon as currentMinutes < end_time, regardless of start_time
  // — it may have been started early (see the start-window guard below), in
  // which case currentMinutes can still be before its scheduled start_time.
  // A merely scheduled meeting still needs currentMinutes >= start_time.
  const current = activeBookings.find((b) => {
    const end = timeToMinutes(b.end_time);
    if (b.status === "in_progress") return currentMinutes < end;
    const start = timeToMinutes(b.start_time);
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

/**
 * How early a scheduled meeting can be manually started, in minutes before
 * its start_time.
 */
export const START_EARLY_WINDOW_MINUTES = 15;

/**
 * True when a meeting can be manually started right now: only on the day
 * it's scheduled, from START_EARLY_WINDOW_MINUTES before its start_time
 * through (not including) its end_time. Used by startMeetingAndNotify's
 * server-side guard and mirrored by the "Start & Notify Slack" button.
 */
export function isWithinStartWindow(
  meetingDate: string,
  startTime: string,
  endTime: string,
  officeToday: string,
  officeNowMinutes: number
): boolean {
  if (meetingDate !== officeToday) return false;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return officeNowMinutes >= start - START_EARLY_WINDOW_MINUTES && officeNowMinutes < end;
}

/**
 * Walks the chain of contiguous/overlapping active (scheduled or in_progress)
 * bookings starting from currentMeeting, returning the end_time of the last
 * meeting in that chain — not just currentMeeting's own end_time. Used for
 * "Next free slot": if the very next booking starts exactly when the current
 * one ends (or sooner), the room isn't actually free at currentMeeting's
 * end_time, so the chain must be followed until an actual gap appears.
 */
export function getChainedAvailableUntil(
  currentMeeting: MeetingBooking,
  todayBookings: MeetingBooking[]
): string {
  const activeBookings = todayBookings
    .filter((b) => b.status === "scheduled" || b.status === "in_progress")
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  let chainEnd = timeToMinutes(currentMeeting.end_time);
  for (const b of activeBookings) {
    const start = timeToMinutes(b.start_time);
    if (start > chainEnd) break;
    const end = timeToMinutes(b.end_time);
    if (end > chainEnd) chainEnd = end;
  }
  return minutesToTime(chainEnd);
}

/**
 * Timeline-click slot math (room-timeline.tsx). A click's horizontal
 * position within the track is expressed as a fraction (0 at startHour, 1 at
 * endHour) and mapped onto the same 30-minute grid TIME_OPTIONS uses.
 */
function fractionToRawMinutes(fraction: number, startHour: number, endHour: number): number {
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const totalMinutes = (endHour - startHour) * 60;
  return startHour * 60 + clampedFraction * totalMinutes;
}

// Clamped to the last valid *start* slot (30 min before endHour) — there's no
// later slot to end at, matching START_TIME_OPTIONS in time-range-fields.tsx.
function clampToStartSlot(minutes: number, startHour: number, endHour: number): string {
  const lastStartMinutes = endHour * 60 - 30;
  const clamped = Math.max(startHour * 60, Math.min(minutes, lastStartMinutes));
  return minutesToTime(clamped);
}

/** Nearest 30-minute slot to a fractional click position. */
export function nearestSlotFromFraction(fraction: number, startHour: number, endHour: number): string {
  const raw = fractionToRawMinutes(fraction, startHour, endHour);
  return clampToStartSlot(Math.round(raw / 30) * 30, startHour, endHour);
}

/**
 * The 30-minute slot at or before a fractional click position — used as a
 * fallback when the nearest slot lands on an already-booked start time (e.g.
 * clicking just before an 11:00 meeting rounds to the booked 11:00 slot).
 */
export function floorSlotFromFraction(fraction: number, startHour: number, endHour: number): string {
  const raw = fractionToRawMinutes(fraction, startHour, endHour);
  return clampToStartSlot(Math.floor(raw / 30) * 30, startHour, endHour);
}

/**
 * True when a 30-minute meeting starting at `startTime` would collide with an
 * existing active booking — a fixed-width probe (independent of whatever
 * duration is currently selected) used to disable already-booked start-time
 * options in TimeRangeFields and to steer the timeline's click-to-book slot
 * away from booked starts.
 */
export function isStartTimeBooked(
  startTime: string,
  existingMeetings: ExistingMeetingTime[],
  ignoreBookingId?: string
): boolean {
  const probeEnd = minutesToTime(timeToMinutes(startTime) + 30);
  return checkMeetingCollision(startTime, probeEnd, existingMeetings, ignoreBookingId).hasConflict;
}
