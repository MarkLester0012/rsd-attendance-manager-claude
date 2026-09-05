-- Meeting Room Manager — follow-up fixes
-- Applied on top of 2026-09-04-meeting-room.sql (already in production). Additive only.

-- ============================================
-- 1. Realtime: meeting_room_bookings was never added to the publication, so
--    the header room-status badge's postgres_changes subscription never fired.
-- ============================================
alter publication supabase_realtime add table public.meeting_room_bookings;

-- ============================================
-- 2. updated_at trigger was present in schema.sql but missing from the
--    original migration that was actually applied — production rows never
--    got their updated_at bumped.
-- ============================================
drop trigger if exists meeting_room_bookings_updated_at on public.meeting_room_bookings;
create trigger meeting_room_bookings_updated_at before update on public.meeting_room_bookings
  for each row execute function public.handle_updated_at();

-- ============================================
-- 3. Format/order guards on the naked 'HH:mm' text columns, and a real
--    overlap constraint so double-booking has a DB-level backstop, not just
--    the app's read-then-insert check.
-- ============================================
alter table public.meeting_room_bookings
  add constraint meeting_time_format
    check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       and end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint meeting_time_order
    check (end_time > start_time);

-- Every date/time text-parsing function in Postgres — date_in, time_in,
-- timestamp_in, even timestamptz_in — is catalogued STABLE, not IMMUTABLE
-- (they all consult the DateStyle GUC), so ANY text::time/timestamp cast is
-- rejected inside a STORED generated column. Verified directly against this
-- project's pg_proc (provolatile='s' for all of them). This expression
-- avoids text parsing entirely: it splits 'HH:mm' into integers with
-- split_part()/::int (both IMMUTABLE) and builds the timestamp with
-- make_interval() (also IMMUTABLE) instead of any date/time input function.
alter table public.meeting_room_bookings
  add column if not exists time_range tsrange
    generated always as (
      tsrange(
        meeting_date::timestamp + make_interval(
          hours => split_part(start_time, ':', 1)::int,
          mins => split_part(start_time, ':', 2)::int
        ),
        meeting_date::timestamp + make_interval(
          hours => split_part(end_time, ':', 1)::int,
          mins => split_part(end_time, ':', 2)::int
        ),
        '[)'
      )
    ) stored;

-- tsrange has native GiST support, so no btree_gist extension is needed here.
alter table public.meeting_room_bookings
  add constraint meeting_room_no_overlap
    exclude using gist (time_range with &&)
    where (status in ('scheduled', 'in_progress'));

create index if not exists idx_meeting_bookings_date_status
  on public.meeting_room_bookings(meeting_date, status);

-- ============================================
-- 4. meeting_attendees had insert/delete policies but no update policy, so
--    the attendee list of an existing booking could never be edited.
-- ============================================
drop policy if exists "meeting_attendees_update" on public.meeting_attendees;
create policy "meeting_attendees_update" on public.meeting_attendees
  for update to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

-- ============================================
-- 5. create_notifications() had no sender-role gate for the meeting_* types,
--    so once callers switch to the RPC (see actions.ts), any authenticated
--    member could otherwise forge meeting notifications to anyone.
-- ============================================
create or replace function public.create_notifications(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender public.users%rowtype;
  item jsonb;
  item_type text;
begin
  select * into sender from public.users where auth_id = auth.uid();
  if sender.id is null then
    raise exception 'not authenticated';
  end if;

  for item in select * from jsonb_array_elements(payload) loop
    item_type := item->>'type';

    if item_type in ('leave_approved', 'leave_rejected', 'project_added', 'project_removed')
       and sender.role not in ('leader', 'hr') then
      raise exception 'only leaders or HR can send % notifications', item_type;
    end if;
    if item_type in ('announcement_new', 'allowance_request_reviewed', 'allowance_submission_reviewed')
       and sender.role <> 'hr' then
      raise exception 'only HR can send % notifications', item_type;
    end if;
    if item_type in ('meeting_scheduled', 'meeting_starting', 'meeting_cancelled', 'meeting_message')
       and sender.role not in ('leader', 'hr') then
      raise exception 'only leaders or HR can send % notifications', item_type;
    end if;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      (item->>'user_id')::uuid,
      item_type,
      item->>'title',
      item->>'body',
      coalesce(item->'data', '{}'::jsonb) || jsonb_build_object('sender_id', sender.id)
    );
  end loop;
end;
$$;
