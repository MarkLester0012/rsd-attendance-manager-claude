-- ============================================
-- allowance_submission_requests
-- Employees submit their own monthly allowance data for HR review.
-- Separate from distance_change_requests (which requires a snapshot_id).
-- ============================================

create table public.allowance_submission_requests (
  id             uuid          primary key default gen_random_uuid(),
  employee_id    uuid          not null references public.users(id) on delete cascade,
  month          text          not null,
  distance_km    numeric(10,2) not null check (distance_km > 0),
  declared_mode  text          not null check (declared_mode in ('car','motorcycle','walk','jeep','bus')),
  days_worked    numeric       not null default 0 check (days_worked >= 0),
  wfh_days       numeric       not null default 0 check (wfh_days >= 0 and wfh_days <= 8),
  jeep_rides     integer       not null default 0 check (jeep_rides >= 0),
  bus_rides      integer       not null default 0 check (bus_rides >= 0),
  undertime_days integer       not null default 0 check (undertime_days >= 0),
  owns_vehicle   boolean       not null default false,
  status         text          not null default 'pending'
    check (status in ('pending','approved','rejected')),
  hr_note        text,
  reviewed_by    uuid          references public.users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

-- Only one active (pending) submission per employee per month
create unique index idx_asr_one_pending
  on public.allowance_submission_requests (employee_id, month)
  where (status = 'pending');

create index idx_asr_employee on public.allowance_submission_requests(employee_id);
create index idx_asr_month    on public.allowance_submission_requests(month);
create index idx_asr_status   on public.allowance_submission_requests(status);

alter table public.allowance_submission_requests enable row level security;

-- Read: employees see own rows, HR sees all
create policy "asr_select" on public.allowance_submission_requests
  for select to authenticated
  using (
    employee_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

-- Insert: employees can only insert their own rows
create policy "asr_insert" on public.allowance_submission_requests
  for insert to authenticated
  with check (employee_id = (select id from public.users where auth_id = auth.uid()));

-- Update: employees can re-update their rejected row (resubmit); HR can update any row
create policy "asr_update" on public.allowance_submission_requests
  for update to authenticated
  using (
    (employee_id = (select id from public.users where auth_id = auth.uid()) and status = 'rejected')
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  )
  with check (
    (employee_id = (select id from public.users where auth_id = auth.uid()) and status = 'pending')
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

create trigger asr_updated_at before update on public.allowance_submission_requests
  for each row execute function public.handle_updated_at();
