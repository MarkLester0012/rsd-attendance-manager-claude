-- Meeting Room Manager — RLS tightening
-- The bookings _delete and meeting_attendees insert/delete policies were
-- open to any leader/HR, letting any leader delete or reassign someone
-- else's booking (or its attendees) directly from the browser client,
-- bypassing the organizer-or-HR check actions.ts already enforces.
-- Additive/replacing only — no table or column changes.

-- ============================================
-- 1. bookings delete: organizer or HR only.
-- ============================================
drop policy if exists "meeting_room_bookings_delete" on public.meeting_room_bookings;
create policy "meeting_room_bookings_delete" on public.meeting_room_bookings
  for delete to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and (role = 'hr' or (role in ('leader', 'hr') and id = meeting_room_bookings.organizer_id))
    )
  );

-- ============================================
-- 2. meeting_attendees insert/delete: organizer (of the booking the
--    attendee row belongs to) or HR only.
-- ============================================
drop policy if exists "meeting_attendees_insert" on public.meeting_attendees;
create policy "meeting_attendees_insert" on public.meeting_attendees
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users u
      join public.meeting_room_bookings b on b.id = meeting_attendees.booking_id
      where u.auth_id = auth.uid()
      and (u.role = 'hr' or (u.role = 'leader' and u.id = b.organizer_id))
    )
  );

drop policy if exists "meeting_attendees_delete" on public.meeting_attendees;
create policy "meeting_attendees_delete" on public.meeting_attendees
  for delete to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.meeting_room_bookings b on b.id = meeting_attendees.booking_id
      where u.auth_id = auth.uid()
      and (u.role = 'hr' or (u.role = 'leader' and u.id = b.organizer_id))
    )
  );

-- ============================================
-- 3. bookings update: USING stays open to any leader/HR (Start/Extend/End
--    Early must keep working for any leader, not just the organizer), but
--    organizer_id must never change through this policy. RLS's WITH CHECK
--    can't reference OLD, so this is enforced with a BEFORE UPDATE trigger
--    instead of a WITH CHECK clause.
-- ============================================
create or replace function public.prevent_organizer_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'organizer_id cannot be changed once a meeting is booked';
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_room_bookings_pin_organizer on public.meeting_room_bookings;
create trigger meeting_room_bookings_pin_organizer
  before update on public.meeting_room_bookings
  for each row execute function public.prevent_organizer_reassignment();
