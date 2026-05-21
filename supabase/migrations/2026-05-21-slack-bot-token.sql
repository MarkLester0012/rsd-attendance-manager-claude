alter table public.users
  add column if not exists slack_bot_token_encrypted text,
  add column if not exists slack_bot_token_iv        text,
  add column if not exists slack_bot_token_tag       text;
