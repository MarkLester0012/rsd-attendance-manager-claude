-- Meeting Room Manager Schema Migration
-- Creates meeting_room_bookings and meeting_attendees tables with RLS and indexes

create table if not exists public.meeting_room_bookings (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  organizer_id uuid not null references public.users(id) on delete cascade,
  meeting_date date not null,
  start_time text not null, -- 'HH:mm' 24h format e.g. '14:00'
  end_time text not null,   -- 'HH:mm' 24h format e.g. '15:00'
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notify_channel boolean not null default true,
  slack_channel text default 'rsd-leader-team',
  slack_message_ts text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.meeting_attendees (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid not null references public.meeting_room_bookings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique (booking_id, user_id)
);

create index if not exists idx_meeting_bookings_date on public.meeting_room_bookings(meeting_date);
create index if not exists idx_meeting_bookings_status on public.meeting_room_bookings(status);
create index if not exists idx_meeting_attendees_booking on public.meeting_attendees(booking_id);
create index if not exists idx_meeting_attendees_user on public.meeting_attendees(user_id);

alter table public.meeting_room_bookings enable row level security;
alter table public.meeting_attendees enable row level security;

-- Policies:
-- Any authenticated user can view bookings & attendees
drop policy if exists "meeting_room_bookings_select" on public.meeting_room_bookings;
create policy "meeting_room_bookings_select" on public.meeting_room_bookings
  for select to authenticated using (true);

drop policy if exists "meeting_attendees_select" on public.meeting_attendees;
create policy "meeting_attendees_select" on public.meeting_attendees
  for select to authenticated using (true);

-- Leaders and HR can insert, update, and delete bookings
drop policy if exists "meeting_room_bookings_insert" on public.meeting_room_bookings;
create policy "meeting_room_bookings_insert" on public.meeting_room_bookings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users
      where id = meeting_room_bookings.organizer_id
      and auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

drop policy if exists "meeting_room_bookings_update" on public.meeting_room_bookings;
create policy "meeting_room_bookings_update" on public.meeting_room_bookings
  for update to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

drop policy if exists "meeting_room_bookings_delete" on public.meeting_room_bookings;
create policy "meeting_room_bookings_delete" on public.meeting_room_bookings
  for delete to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

drop policy if exists "meeting_attendees_insert" on public.meeting_attendees;
create policy "meeting_attendees_insert" on public.meeting_attendees
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

drop policy if exists "meeting_attendees_delete" on public.meeting_attendees;
create policy "meeting_attendees_delete" on public.meeting_attendees
  for delete to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );
