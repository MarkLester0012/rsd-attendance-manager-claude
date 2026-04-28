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
  add column if not exists slack_user_id text unique,
  add column if not exists slack_team_id text;

create index if not exists idx_users_slack_user_id
  on public.users(slack_user_id) where slack_user_id is not null;
