-- Security fixes (2026-07-05)
-- 1. leaves_update let owners update any column, so a member could set their
--    own leave to 'approved' via the REST API. Split into owner (pending-only)
--    and reviewer (leader/hr) policies.
-- 2. notifications_insert let any authenticated user insert notifications for
--    any user_id (forgeable approvals/announcements). Restrict direct inserts
--    to self and add a security-definer function with sender-role checks.
-- 3. Encrypted Slack bot tokens lived on public.users, whose select policy is
--    `using (true)` — every authenticated user could read the ciphertext.
--    Move them to user_slack_tokens (RLS enabled, no authenticated policies;
--    service-role only).

begin;

-- ============================================
-- 1. Leaves: no self-approval
-- ============================================

drop policy if exists "leaves_update" on public.leaves;
drop policy if exists "leaves_insert" on public.leaves;

-- Owners may only create/edit their own leaves as 'pending', except for
-- auto-approved types (must stay in sync with requiresApproval in
-- src/lib/constants/leave-types.ts).
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

-- ============================================
-- 2. Notifications: no forgery
-- ============================================

drop policy if exists "notifications_insert" on public.notifications;

create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));

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
-- 3. Slack bot tokens: service-role only
-- ============================================

create table if not exists public.user_slack_tokens (
  user_id    uuid        primary key references public.users(id) on delete cascade,
  encrypted  text        not null,
  iv         text        not null,
  tag        text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_slack_tokens enable row level security;

drop trigger if exists user_slack_tokens_updated_at on public.user_slack_tokens;
create trigger user_slack_tokens_updated_at before update on public.user_slack_tokens
  for each row execute function public.handle_updated_at();

insert into public.user_slack_tokens (user_id, encrypted, iv, tag)
select id, slack_bot_token_encrypted, slack_bot_token_iv, slack_bot_token_tag
from public.users
where slack_bot_token_encrypted is not null
  and slack_bot_token_iv is not null
  and slack_bot_token_tag is not null
on conflict (user_id) do nothing;

alter table public.users
  drop column if exists slack_bot_token_encrypted,
  drop column if exists slack_bot_token_iv,
  drop column if exists slack_bot_token_tag;

commit;
