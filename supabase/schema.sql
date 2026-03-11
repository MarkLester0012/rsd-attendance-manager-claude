-- ============================================
-- RSD Attendance Manager - Database Schema
-- ============================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- This creates all tables, indexes, RLS policies, and functions.
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Departments
create table public.departments (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  created_at timestamptz default now() not null
);

-- Users (profiles linked to auth.users)
create table public.users (
  id uuid default uuid_generate_v4() primary key,
  auth_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  username text unique,
  email text not null unique,
  role text not null default 'member' check (role in ('member', 'leader', 'hr')),
  department_id uuid references public.departments(id) on delete set null,
  leave_balance numeric(5,1) not null default 15.0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Leaves
create table public.leaves (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  leave_type text not null check (leave_type in ('VL','PL','ML','SPL','SL','NW','RGA','AB','WFH')),
  leave_date date not null,
  duration text not null default 'whole' check (duration in ('whole', 'half_am', 'half_pm')),
  duration_value numeric(2,1) not null default 1.0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  -- Prevent duplicate leaves for same user on same date
  unique(user_id, leave_date)
);

-- Holidays
create table public.holidays (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  observed_date date not null,
  original_date date,
  is_local boolean not null default false,
  created_at timestamptz default now() not null
);

-- Projects
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Project Members (junction table)
create table public.project_members (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(project_id, user_id)
);

-- Suggestions
create table public.suggestions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz default now() not null
);

-- Suggestion Upvotes
create table public.suggestion_upvotes (
  id uuid default uuid_generate_v4() primary key,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(suggestion_id, user_id)
);

-- Announcements
create table public.announcements (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  content text not null,
  author_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- INDEXES
-- ============================================

create index idx_users_auth_id on public.users(auth_id);
create index idx_users_role on public.users(role);
create index idx_users_department on public.users(department_id);
create index idx_leaves_user_id on public.leaves(user_id);
create index idx_leaves_date on public.leaves(leave_date);
create index idx_leaves_status on public.leaves(status);
create index idx_leaves_type on public.leaves(leave_type);
create index idx_leaves_user_date on public.leaves(user_id, leave_date);
create index idx_holidays_date on public.holidays(observed_date);
create index idx_project_members_project on public.project_members(project_id);
create index idx_project_members_user on public.project_members(user_id);
create index idx_suggestions_user on public.suggestions(user_id);
create index idx_suggestion_upvotes_suggestion on public.suggestion_upvotes(suggestion_id);
create index idx_announcements_author on public.announcements(author_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
alter table public.departments enable row level security;
alter table public.users enable row level security;
alter table public.leaves enable row level security;
alter table public.holidays enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.suggestions enable row level security;
alter table public.suggestion_upvotes enable row level security;
alter table public.announcements enable row level security;

-- Departments: all authenticated users can read
create policy "departments_select" on public.departments for select to authenticated using (true);
create policy "departments_manage" on public.departments for all to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));

-- Users: all authenticated can read, HR can manage
create policy "users_select" on public.users for select to authenticated using (true);
create policy "users_insert" on public.users for insert to authenticated
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr') or auth_id = auth.uid());
create policy "users_update" on public.users for update to authenticated
  using (auth_id = auth.uid() or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));
create policy "users_delete" on public.users for delete to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));

-- Leaves: users can manage own, leaders/HR can view all, leaders/HR can update status
create policy "leaves_select" on public.leaves for select to authenticated using (true);
create policy "leaves_insert" on public.leaves for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "leaves_update" on public.leaves for update to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role in ('leader', 'hr'))
  );
create policy "leaves_delete" on public.leaves for delete to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

-- Holidays: all can read, HR can manage
create policy "holidays_select" on public.holidays for select to authenticated using (true);
create policy "holidays_manage" on public.holidays for all to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));

-- Projects: all can read, leaders can manage
create policy "projects_select" on public.projects for select to authenticated using (true);
create policy "projects_insert" on public.projects for insert to authenticated
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'leader'));
create policy "projects_update" on public.projects for update to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'leader'));
create policy "projects_delete" on public.projects for delete to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'leader'));

-- Project Members: all can read, leaders can manage
create policy "project_members_select" on public.project_members for select to authenticated using (true);
create policy "project_members_insert" on public.project_members for insert to authenticated
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'leader'));
create policy "project_members_delete" on public.project_members for delete to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'leader'));

-- Suggestions: all can read, authenticated can insert, users manage own
create policy "suggestions_select" on public.suggestions for select to authenticated using (true);
create policy "suggestions_insert" on public.suggestions for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));

-- Suggestion Upvotes: all can read, users manage own
create policy "upvotes_select" on public.suggestion_upvotes for select to authenticated using (true);
create policy "upvotes_insert" on public.suggestion_upvotes for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "upvotes_delete" on public.suggestion_upvotes for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Announcements: all can read, HR can manage
create policy "announcements_select" on public.announcements for select to authenticated using (true);
create policy "announcements_insert" on public.announcements for insert to authenticated
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));
create policy "announcements_update" on public.announcements for update to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));
create policy "announcements_delete" on public.announcements for delete to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for leaves table (for approval notifications)
alter publication supabase_realtime add table public.leaves;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at before update on public.users
  for each row execute function public.handle_updated_at();

create trigger leaves_updated_at before update on public.leaves
  for each row execute function public.handle_updated_at();

create trigger projects_updated_at before update on public.projects
  for each row execute function public.handle_updated_at();

create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.handle_updated_at();
