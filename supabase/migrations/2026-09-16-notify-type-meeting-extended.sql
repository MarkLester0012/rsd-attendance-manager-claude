-- Meeting Room Manager — add meeting_extended to the notification sender-role gate
-- Applied on top of 2026-09-05-meeting-room-fixes.sql. Additive-only function replace.
--
-- extendMeeting() now notifies organizers of that day's other, later meetings
-- via a new 'meeting_extended' notification type. Without adding it to this
-- list, create_notifications() would let ANY authenticated user forge a
-- 'meeting_extended' notification for anyone (the same gap the existing
-- meeting_scheduled/meeting_starting/meeting_cancelled/meeting_message
-- entries were added to close) — this closes it for the new type too.

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
    if item_type in ('meeting_scheduled', 'meeting_starting', 'meeting_cancelled', 'meeting_message', 'meeting_extended')
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
