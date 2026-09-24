-- Add "Extended WFH" (EWFH) leave type: auto-approved and non-deducting,
-- like WFH, but with no monthly credits of its own and no WFH/commute
-- transportation allowance (see WFH_LIKE_TYPES in
-- src/lib/constants/leave-types.ts and the app-side gate in
-- src/components/leaves/leave-modal.tsx that only lets a user file EWFH
-- once their approved WFH for the month reaches the 8-day cap).
-- Run this manually in the Supabase SQL Editor.

begin;

alter table public.leaves
  drop constraint leaves_leave_type_check;

alter table public.leaves
  add constraint leaves_leave_type_check
  check (leave_type in ('VL','PL','ML','SPL','SL','NW','RGA','AB','WFH','BL','EWFH'));

-- EWFH is auto-approved like WFH, so it must be added to the same
-- auto-approve allowlist used by leaves_insert / leaves_update_own.
drop policy if exists "leaves_insert" on public.leaves;
create policy "leaves_insert" on public.leaves for insert to authenticated
  with check (
    user_id = (select id from public.users where auth_id = auth.uid())
    and (status = 'pending' or leave_type in ('SL', 'NW', 'RGA', 'AB', 'WFH', 'EWFH'))
  );

drop policy if exists "leaves_update_own" on public.leaves;
create policy "leaves_update_own" on public.leaves for update to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    and (status = 'pending' or leave_type in ('SL', 'NW', 'RGA', 'AB', 'WFH', 'EWFH'))
  )
  with check (
    user_id = (select id from public.users where auth_id = auth.uid())
    and (status = 'pending' or leave_type in ('SL', 'NW', 'RGA', 'AB', 'WFH', 'EWFH'))
  );

commit;
