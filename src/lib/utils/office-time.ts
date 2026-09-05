/**
 * Office-timezone helpers. Server-side date math (cron, Slack commands) runs on
 * infrastructure in UTC, but meeting times are entered and compared as office
 * wall-clock time. All server-side "what time is it right now" checks for the
 * meeting room feature should go through these helpers instead of `new Date()`
 * directly, so the office timezone is defined in exactly one place.
 */

export const OFFICE_TZ = "Asia/Manila";

/**
 * Returns the current date in the office timezone, as 'yyyy-MM-dd'.
 */
export function officeDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Returns the current time-of-day in the office timezone, as minutes since
 * midnight (0..1439).
 */
export function officeMinutesOfDay(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl can render midnight as "24" with hour12: false in some engines.
  const hour = Number(map.hour) % 24;
  return hour * 60 + Number(map.minute);
}
