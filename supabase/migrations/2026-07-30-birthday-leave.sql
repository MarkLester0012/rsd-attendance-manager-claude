-- Add "Birthday Leave" (BL) leave type: non-deducting, still requires approval.
-- Run this manually in the Supabase SQL Editor.

alter table public.leaves
  drop constraint leaves_leave_type_check;

alter table public.leaves
  add constraint leaves_leave_type_check
  check (leave_type in ('VL','PL','ML','SPL','SL','NW','RGA','AB','WFH','BL'));
