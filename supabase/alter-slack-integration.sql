-- Run this against an existing database to add Slack integration columns.
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS logic).

alter table public.users
  add column if not exists slack_user_id text unique,
  add column if not exists slack_team_id text;

create index if not exists idx_users_slack_user_id
  on public.users(slack_user_id) where slack_user_id is not null;
