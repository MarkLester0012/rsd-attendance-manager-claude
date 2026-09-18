// Single source of truth for the meeting room's bookable time range: used by
// both web modals (book-meeting-modal.tsx, edit-meeting-modal.tsx), the Slack
// `/meeting-room book` modal (meeting-modal.ts), and the room timeline
// (meeting-room-content.tsx) — previously duplicated across all four.
export const MEETING_ROOM_START_HOUR = 7;
export const MEETING_ROOM_END_HOUR = 20;

// Standard 30-min time slots from 07:00 to 20:00 (27 slots).
export const TIME_OPTIONS: string[] = Array.from(
  { length: (MEETING_ROOM_END_HOUR - MEETING_ROOM_START_HOUR) * 2 + 1 },
  (_, i) => {
    const totalMinutes = MEETING_ROOM_START_HOUR * 60 + i * 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
);
