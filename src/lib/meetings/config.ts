// Centralizes the meeting-room feature's env-derived config — previously
// duplicated across meeting-room/actions.ts, api/cron/meetings/route.ts,
// api/slack/shortcut/route.ts, lib/slack/meetings.ts, and meeting-room/page.tsx.
// Server-only: reads process.env directly and must never be imported from a
// client component.

// Server-only var (not NEXT_PUBLIC_): NEXT_PUBLIC_* vars are inlined into the
// bundle at build time, so if unset at build time every Slack button would
// permanently point at localhost regardless of the runtime environment.
// APP_URL is read at request time instead.
export const APP_URL = process.env.APP_URL || "http://localhost:3000";
if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
  console.error("APP_URL is not set — Slack meeting links will point at localhost.");
}

export const DEFAULT_CHANNEL = process.env.SLACK_MEETING_ROOM_CHANNEL || "rsd-leader-team";
