-- ============================================
-- Suggestions discussion: likes/dislikes, comments, replies, edit/delete
-- Safe to re-run on existing databases.
-- ============================================

-- Likes/dislikes on suggestions (evolves the existing upvotes table)
alter table public.suggestion_upvotes
  add column if not exists vote_type text not null default 'like'
    check (vote_type in ('like', 'dislike'));

-- Edit tracking on suggestions
alter table public.suggestions
  add column if not exists updated_at timestamptz default now() not null;
alter table public.suggestions
  add column if not exists is_edited boolean not null default false;

-- Owner can update/delete own suggestion; HR can delete any
drop policy if exists "suggestions_update" on public.suggestions;
create policy "suggestions_update" on public.suggestions for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

drop policy if exists "suggestions_delete" on public.suggestions;
create policy "suggestions_delete" on public.suggestions for delete to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

-- Users can switch their vote (insert/delete existing works, but update is allowed for safety)
drop policy if exists "upvotes_update" on public.suggestion_upvotes;
create policy "upvotes_update" on public.suggestion_upvotes for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- Comments (replies use parent_id)
create table if not exists public.suggestion_comments (
  id uuid default uuid_generate_v4() primary key,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  parent_id uuid references public.suggestion_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  is_edited boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_suggestion_comments_suggestion on public.suggestion_comments(suggestion_id);
create index if not exists idx_suggestion_comments_parent on public.suggestion_comments(parent_id);
create index if not exists idx_suggestion_comments_user on public.suggestion_comments(user_id);

alter table public.suggestion_comments enable row level security;

drop policy if exists "suggestion_comments_select" on public.suggestion_comments;
create policy "suggestion_comments_select" on public.suggestion_comments for select to authenticated using (true);

drop policy if exists "suggestion_comments_insert" on public.suggestion_comments;
create policy "suggestion_comments_insert" on public.suggestion_comments for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));

drop policy if exists "suggestion_comments_update" on public.suggestion_comments;
create policy "suggestion_comments_update" on public.suggestion_comments for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

drop policy if exists "suggestion_comments_delete" on public.suggestion_comments;
create policy "suggestion_comments_delete" on public.suggestion_comments for delete to authenticated
  using (
    user_id = (select id from public.users where auth_id = auth.uid())
    or exists (select 1 from public.users where auth_id = auth.uid() and role = 'hr')
  );

-- Comment votes (like/dislike)
create table if not exists public.suggestion_comment_votes (
  id uuid default uuid_generate_v4() primary key,
  comment_id uuid not null references public.suggestion_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote_type text not null default 'like' check (vote_type in ('like', 'dislike')),
  created_at timestamptz default now() not null,
  unique(comment_id, user_id)
);

create index if not exists idx_suggestion_comment_votes_comment on public.suggestion_comment_votes(comment_id);

alter table public.suggestion_comment_votes enable row level security;

drop policy if exists "suggestion_comment_votes_select" on public.suggestion_comment_votes;
create policy "suggestion_comment_votes_select" on public.suggestion_comment_votes for select to authenticated using (true);

drop policy if exists "suggestion_comment_votes_insert" on public.suggestion_comment_votes;
create policy "suggestion_comment_votes_insert" on public.suggestion_comment_votes for insert to authenticated
  with check (user_id = (select id from public.users where auth_id = auth.uid()));

drop policy if exists "suggestion_comment_votes_update" on public.suggestion_comment_votes;
create policy "suggestion_comment_votes_update" on public.suggestion_comment_votes for update to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

drop policy if exists "suggestion_comment_votes_delete" on public.suggestion_comment_votes;
create policy "suggestion_comment_votes_delete" on public.suggestion_comment_votes for delete to authenticated
  using (user_id = (select id from public.users where auth_id = auth.uid()));

-- updated_at triggers
drop trigger if exists suggestions_updated_at on public.suggestions;
create trigger suggestions_updated_at before update on public.suggestions
  for each row execute function public.handle_updated_at();

drop trigger if exists suggestion_comments_updated_at on public.suggestion_comments;
create trigger suggestion_comments_updated_at before update on public.suggestion_comments
  for each row execute function public.handle_updated_at();
