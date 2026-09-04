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
  leave_type text not null check (leave_type in ('VL','PL','ML','SPL','SL','NW','RGA','AB','WFH','BL')),
  leave_date date not null,
  duration text not null default 'whole' check (duration in ('whole', 'half_am', 'half_pm')),
  duration_value numeric(2,1) not null default 1.0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  -- Prevent duplicate leaves for same user on same date+slot (allows AM+PM pair)
  unique(user_id, leave_date, duration)
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
  color text,
  redmine_code text,
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
  is_edited boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Suggestion Votes (like/dislike). Table name kept as "suggestion_upvotes" for continuity.
create table public.suggestion_upvotes (
  id uuid default uuid_generate_v4() primary key,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote_type text not null default 'like' check (vote_type in ('like', 'dislike')),
  created_at timestamptz default now() not null,
  unique(suggestion_id, user_id)
);

-- Suggestion Comments (replies use parent_id)
create table public.suggestion_comments (
  id uuid default uuid_generate_v4() primary key,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  parent_id uuid references public.suggestion_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  is_edited boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Comment votes (like/dislike)
create table public.suggestion_comment_votes (
  id uuid default uuid_generate_v4() primary key,
  comment_id uuid not null references public.suggestion_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote_type text not null default 'like' check (vote_type in ('like', 'dislike')),
  created_at timestamptz default now() not null,
  unique(comment_id, user_id)
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
create index idx_suggestion_comments_suggestion on public.suggestion_comments(suggestion_id);
create index idx_suggestion_comments_parent on public.suggestion_comments(parent_id);
create index idx_suggestion_comments_user on public.suggestion_comments(user_id);
create index idx_suggestion_comment_votes_comment on public.suggestion_comment_votes(comment_id);
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
alter table public.suggestion_comments enable row level security;
alter table public.suggestion_comment_votes enable row level security;
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
-- Owners may only create/edit their own leaves as 'pending', except for
-- auto-approved types. This list is the AUTO-APPROVED set (requiresApproval:
-- false in src/lib/constants/leave-types.ts) — NOT the non-deducting set.
-- Approval-required types (e.g. BL) must NOT be added here, or a member
-- could self-approve by updating status directly. Approving/rejecting
-- approval-required types is reserved for leaders/HR (leaves_update_review
-- below).
create policy "leaves_insert" on public.leaves for insert to authenticated
  with check (
    user_id = (select id from public.users where auth_id = auth.uid())
    and (status = 'pending' or leave_type in ('SL', 'NW', 'RGA', 'AB', 'WFH'))
  );
create policy "leaves_update_own" on public.leaves for update to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    and (status = 'pending' or leave_type in ('SL', 'NW', 'RGA', 'AB', 'WFH'))
  )
  with check (
    user_id = (select id from public.users where auth_id = auth.uid())
    and (status = 'pending' or leave_type in ('SL', 'NW', 'RGA', 'AB', 'WFH'))
  );
create policy "leaves_update_review" on public.leaves for update to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role in ('leader', 'hr')))
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role in ('leader', 'hr')));
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

-- Suggestions: all can read, authenticated can insert, owner can edit, owner/HR can delete
create policy "suggestions_select" on public.suggestions for select to authenticated using (true);
create policy "suggestions_insert" on public.suggestions for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "suggestions_update" on public.suggestions for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "suggestions_delete" on public.suggestions for delete to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

-- Suggestion Votes: all can read, users manage own
create policy "upvotes_select" on public.suggestion_upvotes for select to authenticated using (true);
create policy "upvotes_insert" on public.suggestion_upvotes for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "upvotes_update" on public.suggestion_upvotes for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "upvotes_delete" on public.suggestion_upvotes for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Suggestion Comments: all can read, users manage own, HR can delete any
create policy "suggestion_comments_select" on public.suggestion_comments for select to authenticated using (true);
create policy "suggestion_comments_insert" on public.suggestion_comments for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "suggestion_comments_update" on public.suggestion_comments for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "suggestion_comments_delete" on public.suggestion_comments for delete to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

-- Comment Votes: all can read, users manage own
create policy "suggestion_comment_votes_select" on public.suggestion_comment_votes for select to authenticated using (true);
create policy "suggestion_comment_votes_insert" on public.suggestion_comment_votes for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "suggestion_comment_votes_update" on public.suggestion_comment_votes for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "suggestion_comment_votes_delete" on public.suggestion_comment_votes for delete to authenticated
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

create trigger suggestions_updated_at before update on public.suggestions
  for each row execute function public.handle_updated_at();

create trigger suggestion_comments_updated_at before update on public.suggestion_comments
  for each row execute function public.handle_updated_at();

-- ============================================
-- REDMINE TIME LOGGER TABLES
-- ============================================

-- Redmine API configuration per user
create table public.redmine_configs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null unique references public.users(id) on delete cascade,
  redmine_url text not null,
  encrypted_api_key text not null,
  encryption_iv text not null,
  encryption_tag text not null,
  default_activity_id integer,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Time log entries (drafts and submitted)
create table public.time_log_entries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  log_date date not null,
  issue_id integer not null,
  project_name text,
  hours numeric(4,2) not null check (hours > 0),
  activity_id integer not null,
  activity_name text,
  comment text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'failed')),
  redmine_time_entry_id integer,
  error_message text,
  custom_fields jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- User-defined custom required fields per Redmine project
create table public.redmine_project_fields (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  redmine_project_id integer not null,
  redmine_project_name text not null,
  field_id integer not null,
  field_name text not null,
  field_type text not null default 'text',
  possible_values jsonb,
  is_required boolean not null default true,
  created_at timestamptz default now() not null,
  unique(user_id, redmine_project_id, field_id)
);

-- Indexes
create index idx_redmine_configs_user on public.redmine_configs(user_id);
create index idx_time_log_entries_user on public.time_log_entries(user_id);
create index idx_time_log_entries_date on public.time_log_entries(log_date);
create index idx_time_log_entries_user_date on public.time_log_entries(user_id, log_date);
create index idx_time_log_entries_status on public.time_log_entries(status);
create index idx_redmine_project_fields_user on public.redmine_project_fields(user_id);

-- RLS
alter table public.redmine_configs enable row level security;
alter table public.time_log_entries enable row level security;
alter table public.redmine_project_fields enable row level security;

-- Redmine configs: user can only CRUD their own
create policy "redmine_configs_select" on public.redmine_configs for select to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "redmine_configs_insert" on public.redmine_configs for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "redmine_configs_update" on public.redmine_configs for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "redmine_configs_delete" on public.redmine_configs for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Time log entries: user can only CRUD their own
create policy "time_log_entries_select" on public.time_log_entries for select to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "time_log_entries_insert" on public.time_log_entries for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "time_log_entries_update" on public.time_log_entries for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "time_log_entries_delete" on public.time_log_entries for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Redmine project fields: user can only CRUD their own
create policy "redmine_project_fields_select" on public.redmine_project_fields for select to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "redmine_project_fields_insert" on public.redmine_project_fields for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "redmine_project_fields_update" on public.redmine_project_fields for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));
create policy "redmine_project_fields_delete" on public.redmine_project_fields for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Triggers
create trigger redmine_configs_updated_at before update on public.redmine_configs
  for each row execute function public.handle_updated_at();

create trigger time_log_entries_updated_at before update on public.time_log_entries
  for each row execute function public.handle_updated_at();

-- ============================================
-- SLACK INTEGRATION
-- ============================================

alter table public.users
  add column if not exists slack_user_id             text unique,
  add column if not exists slack_team_id             text;

create index if not exists idx_users_slack_user_id
  on public.users(slack_user_id) where slack_user_id is not null;

-- Encrypted Slack bot tokens live in a separate table with RLS enabled and no
-- policies for the authenticated role: only the service-role client (used by
-- the Slack API routes) can read or write them. Keeping them on public.users
-- would expose the ciphertext to every authenticated user via users_select.
create table if not exists public.user_slack_tokens (
  user_id    uuid        primary key references public.users(id) on delete cascade,
  encrypted  text        not null,
  iv         text        not null,
  tag        text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_slack_tokens enable row level security;

create trigger user_slack_tokens_updated_at before update on public.user_slack_tokens
  for each row execute function public.handle_updated_at();

-- ============================================
-- NOTIFICATIONS
-- ============================================

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text,
  data        jsonb       not null default '{}',
  read        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx    on public.notifications(user_id);
create index if not exists notifications_unread_idx     on public.notifications(user_id, read) where read = false;
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications for select to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Direct inserts are limited to self-notifications; notifying other users must
-- go through the create_notifications() security-definer function below, which
-- enforces per-type sender-role checks.
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));

create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

create policy "notifications_delete" on public.notifications for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

alter publication supabase_realtime add table public.notifications;

-- Creates notifications on behalf of the calling user, with per-type checks on
-- the sender's role so clients cannot forge approval/HR notifications for
-- other users. The caller's user id is stamped into data.sender_id for audit.
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

revoke all on function public.create_notifications(jsonb) from public;
grant execute on function public.create_notifications(jsonb) to authenticated;

-- ============================================
-- TRANSPORTATION ALLOWANCE
-- ============================================

create table public.allowance_snapshots (
  id uuid default uuid_generate_v4() primary key,
  employee_id uuid not null references public.users(id) on delete cascade,
  month text not null, -- YYYY-MM
  payment_date date,
  distance_km numeric(10,2) not null default 0 check (distance_km >= 0),
  declared_mode text not null default 'walk'
    check (declared_mode in ('car', 'motorcycle', 'walk', 'jeep', 'bus')),
  days_worked numeric not null default 0 check (days_worked >= 0),
  wfh_days numeric not null default 0 check (wfh_days >= 0 and wfh_days <= 8),
  jeep_rides integer not null default 0 check (jeep_rides >= 0),
  bus_rides integer not null default 0 check (bus_rides >= 0),
  undertime_days integer not null default 0 check (undertime_days >= 0),
  owns_vehicle boolean not null default false,
  mode_config jsonb not null default '{}',
  total_allowance numeric(12,2) not null default 0,
  locked boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(employee_id, month)
);

create table public.distance_change_requests (
  id uuid default uuid_generate_v4() primary key,
  snapshot_id uuid not null references public.allowance_snapshots(id) on delete cascade,
  employee_id uuid not null references public.users(id) on delete cascade,
  requested_distance_km numeric(10,2) not null check (requested_distance_km > 0),
  requested_mode text
    check (requested_mode in ('car', 'motorcycle', 'walk', 'jeep', 'bus')),
  reason text not null,
  requested_days_worked    numeric,
  requested_wfh_days       numeric,
  requested_jeep_rides     integer,
  requested_bus_rides      integer,
  requested_undertime_days integer,
  requested_owns_vehicle   boolean,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  hr_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_allowance_snapshots_employee on public.allowance_snapshots(employee_id);
create index idx_allowance_snapshots_month on public.allowance_snapshots(month);
create index idx_distance_change_requests_snapshot on public.distance_change_requests(snapshot_id);
create index idx_distance_change_requests_employee on public.distance_change_requests(employee_id);
create index idx_distance_change_requests_status on public.distance_change_requests(status);

-- RLS
alter table public.allowance_snapshots enable row level security;
alter table public.distance_change_requests enable row level security;

-- Allowance snapshots: employees see own, HR sees all and can manage
create policy "allowance_snapshots_select" on public.allowance_snapshots for select to authenticated
  using (
    employee_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );
create policy "allowance_snapshots_insert" on public.allowance_snapshots for insert to authenticated
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));
create policy "allowance_snapshots_update" on public.allowance_snapshots for update to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'))
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));
create policy "allowance_snapshots_delete" on public.allowance_snapshots for delete to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));

-- Distance change requests: employees see/create own, HR sees all and can update status
create policy "distance_change_requests_select" on public.distance_change_requests for select to authenticated
  using (
    employee_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );
create policy "distance_change_requests_insert" on public.distance_change_requests for insert to authenticated
  with check (employee_id = (select id from public.users where auth_id = auth.uid()));
create policy "distance_change_requests_update" on public.distance_change_requests for update to authenticated
  using (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'))
  with check (exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr'));

-- Triggers
create trigger allowance_snapshots_updated_at before update on public.allowance_snapshots
  for each row execute function public.handle_updated_at();

-- ============================================
-- allowance_submission_requests
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

create unique index idx_asr_one_pending
  on public.allowance_submission_requests (employee_id, month)
  where (status = 'pending');

create index idx_asr_employee on public.allowance_submission_requests(employee_id);
create index idx_asr_month    on public.allowance_submission_requests(month);
create index idx_asr_status   on public.allowance_submission_requests(status);

alter table public.allowance_submission_requests enable row level security;

create policy "asr_select" on public.allowance_submission_requests
  for select to authenticated
  using (
    employee_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

create policy "asr_insert" on public.allowance_submission_requests
  for insert to authenticated
  with check (employee_id = (select id from public.users where auth_id = auth.uid()));

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

-- ============================================
-- MEETING ROOM MANAGER
-- ============================================

create table public.meeting_room_bookings (
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

create table public.meeting_attendees (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid not null references public.meeting_room_bookings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique (booking_id, user_id)
);

create index idx_meeting_bookings_date on public.meeting_room_bookings(meeting_date);
create index idx_meeting_bookings_status on public.meeting_room_bookings(status);
create index idx_meeting_attendees_booking on public.meeting_attendees(booking_id);
create index idx_meeting_attendees_user on public.meeting_attendees(user_id);

alter table public.meeting_room_bookings enable row level security;
alter table public.meeting_attendees enable row level security;

create policy "meeting_room_bookings_select" on public.meeting_room_bookings
  for select to authenticated using (true);

create policy "meeting_attendees_select" on public.meeting_attendees
  for select to authenticated using (true);

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

create policy "meeting_room_bookings_update" on public.meeting_room_bookings
  for update to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

create policy "meeting_room_bookings_delete" on public.meeting_room_bookings
  for delete to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

create policy "meeting_attendees_insert" on public.meeting_attendees
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

create policy "meeting_attendees_delete" on public.meeting_attendees
  for delete to authenticated
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('leader', 'hr')
    )
  );

create trigger meeting_room_bookings_updated_at before update on public.meeting_room_bookings
  for each row execute function public.handle_updated_at();

