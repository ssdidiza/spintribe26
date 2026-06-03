-- ============================================================
-- Beta feedback board: suggestions, votes, realtime messages
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.feedback_items (
  id                uuid primary key default gen_random_uuid(),
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  title             text not null check (char_length(trim(title)) between 3 and 120),
  body              text not null check (char_length(trim(body)) between 3 and 2000),
  category          text not null default 'idea' check (category in ('bug', 'idea', 'confusing', 'request', 'other')),
  status            text not null default 'open' check (status in ('open', 'planned', 'shipped', 'closed')),
  admin_summary     text default '',
  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.feedback_votes (
  feedback_item_id  uuid not null references public.feedback_items(id) on delete cascade,
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (feedback_item_id, user_strava_id)
);

create table if not exists public.feedback_messages (
  id                bigserial primary key,
  feedback_item_id  uuid not null references public.feedback_items(id) on delete cascade,
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  body              text not null check (char_length(trim(body)) between 1 and 2000),
  is_admin          boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists idx_feedback_items_last_message
  on public.feedback_items(last_message_at desc, created_at desc);

create index if not exists idx_feedback_items_user
  on public.feedback_items(user_strava_id, created_at desc);

create index if not exists idx_feedback_votes_user
  on public.feedback_votes(user_strava_id, created_at desc);

create index if not exists idx_feedback_messages_item_created
  on public.feedback_messages(feedback_item_id, created_at asc);

create index if not exists idx_feedback_messages_user
  on public.feedback_messages(user_strava_id, created_at desc);

create or replace function public.feedback_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_items_touch_updated_at on public.feedback_items;
create trigger feedback_items_touch_updated_at
before update on public.feedback_items
for each row
execute function public.feedback_touch_updated_at();

alter table public.feedback_items enable row level security;
alter table public.feedback_votes enable row level security;
alter table public.feedback_messages enable row level security;

grant select on public.feedback_items, public.feedback_votes, public.feedback_messages to anon, authenticated;
grant usage, select on sequence public.feedback_messages_id_seq to authenticated;

drop policy if exists "feedback_items_read_all" on public.feedback_items;
drop policy if exists "feedback_votes_read_all" on public.feedback_votes;
drop policy if exists "feedback_messages_read_all" on public.feedback_messages;

create policy "feedback_items_read_all" on public.feedback_items for select using (true);
create policy "feedback_votes_read_all" on public.feedback_votes for select using (true);
create policy "feedback_messages_read_all" on public.feedback_messages for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_items'
  ) then
    alter publication supabase_realtime add table public.feedback_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_votes'
  ) then
    alter publication supabase_realtime add table public.feedback_votes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_messages'
  ) then
    alter publication supabase_realtime add table public.feedback_messages;
  end if;
end $$;
