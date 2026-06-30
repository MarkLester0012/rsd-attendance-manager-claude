-- Allow two half-day leaves on the same date (one half_am + one half_pm)
-- by replacing the day-level unique with a day+duration unique.
-- Run this manually in the Supabase SQL Editor.

alter table public.leaves
  drop constraint if exists leaves_user_id_leave_date_key;

alter table public.leaves
  add constraint leaves_user_date_duration_key
  unique (user_id, leave_date, duration);
