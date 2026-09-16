-- Meeting Room Manager — track whether a meeting was ever extended
-- Applied on top of 2026-09-05-meeting-room-fixes.sql. Additive only.
--
-- extendMeeting() (src/app/(dashboard)/meeting-room/actions.ts) mutates
-- end_time in place, so there was no way to tell after the fact whether a
-- completed meeting's end_time reflected an extension or its original
-- schedule. This column makes that an explicit, persisted fact instead of
-- something inferred (unreliably) by comparing ended_at to end_time.

alter table public.meeting_room_bookings
  add column if not exists was_extended boolean not null default false;
