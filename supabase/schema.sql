-- ============================================================
-- SpinTribe26 — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- USERS
create table if not exists public.users (
  strava_id             text primary key,
  name                  text not null,
  avatar                text,
  role                  text not null default 'member',   -- 'champion' | 'member' | 'admin'
  tier                  int  not null default 200,        -- 200 | 400 | 600 | 800 | 1000
  strava_access_token   text,
  strava_refresh_token  text,
  strava_token_expires_at bigint,
  onboarded             boolean not null default false,
  zone                  text,
  ftp                   int,
  ftp_cached_at         timestamptz,
  country               text,
  last_strava_sync_at   timestamptz,
  last_strava_sync_year int,
  last_strava_sync_month int,
  rewards_export_consent boolean not null default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ACTIVITIES (cached from Strava, refreshed on sync)
create table if not exists public.activities (
  id              bigserial primary key,
  strava_id       text unique not null,
  user_strava_id  text not null references public.users(strava_id) on delete cascade,
  name            text not null,
  distance        numeric not null,   -- metres
  moving_time     int    not null,    -- seconds
  type            text   not null,    -- 'Ride' | 'VirtualRide' etc.
  date            timestamptz not null,
  kudos           int default 0,
  detected_zone_id text,
  created_at      timestamptz default now()
);

-- ZONES
create table if not exists public.zones (
  id              bigserial primary key,
  name            text not null,
  region          text not null,
  type            text not null default 'geographic',  -- 'geographic' | 'training'
  description     text default '',
  created_by      text references public.users(strava_id) on delete set null,
  created_by_name text default '',
  usage_count     int  not null default 0,
  created_at      timestamptz default now()
);

create unique index if not exists idx_zones_name_region
  on public.zones (lower(name), lower(region));

-- CHAMPION SESSIONS
create table if not exists public.champion_sessions (
  id                    bigserial primary key,
  user_strava_id        text not null references public.users(strava_id) on delete cascade,
  type                  text not null,      -- 'champing' | 'ftp_improver'
  date                  timestamptz not null default now(),
  notes                 text default '',
  -- Zone linking
  zone_id               bigint references public.zones(id) on delete set null,
  zone_name             text default '',
  -- Strava activity proof (Rule D: unique per user)
  strava_activity_id    text,
  strava_activity_name  text default '',
  strava_activity_km    int,
  created_at            timestamptz default now()
);

-- Rule D: prevent same Strava activity being logged twice per user
create unique index if not exists idx_champ_sessions_unique_activity
  on public.champion_sessions (user_strava_id, strava_activity_id)
  where strava_activity_id is not null;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_activities_user    on public.activities(user_strava_id);
create index if not exists idx_activities_date    on public.activities(date);
create index if not exists idx_champ_sessions_user on public.champion_sessions(user_strava_id);

-- ============================================================
-- EXPLICIT GRANTS (required from May 30 2026 for new projects,
-- October 30 2026 for all projects — Supabase Data API change)
-- All writes go through supabaseAdmin (service role) in API routes.
-- The anon/authenticated grants below cover the one client-side
-- query: supabase.from("users").select() in app/page.tsx after email login.
-- ============================================================
revoke select on public.users from anon, authenticated;
grant select (strava_id, name, avatar, role, tier, onboarded, zone, ftp, ftp_cached_at, country, leaderboard_consent, rewards_export_consent, created_at, updated_at)
  on public.users
  to anon, authenticated;

grant select
  on public.activities, public.zones, public.champion_sessions
  to anon;

grant select, insert, update, delete
  on public.activities, public.zones, public.champion_sessions
  to authenticated;

-- Sequence access for bigserial inserts (if authenticated role ever inserts directly)
grant usage, select
  on all sequences in schema public
  to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- All writes go through supabaseAdmin (service role) in API routes,
-- which bypasses RLS. RLS policies here protect direct anon-key access.
-- ============================================================
alter table public.users             enable row level security;
alter table public.activities        enable row level security;
alter table public.champion_sessions enable row level security;
alter table public.zones             enable row level security;

-- Users: anyone can read profile/leaderboard metadata, only owner can update
create policy "users_read_all"   on public.users for select using (true);
create policy "users_update_own" on public.users for update
  using (strava_id = current_setting('app.strava_id', true));

-- Activities: raw Strava activities stay private to the owning athlete.
-- Public leaderboards should use API routes or aggregate views, not raw rows.
create policy "activities_read_own"   on public.activities for select
  using (user_strava_id = current_setting('app.strava_id', true));
create policy "activities_insert_own" on public.activities for insert
  with check (user_strava_id = current_setting('app.strava_id', true));
create policy "activities_update_own" on public.activities for update
  using (user_strava_id = current_setting('app.strava_id', true));

-- Champion sessions: anyone can read, only owner can insert/delete (Rule B)
create policy "sessions_read_all"   on public.champion_sessions for select using (true);
create policy "sessions_insert_own" on public.champion_sessions for insert
  with check (user_strava_id = current_setting('app.strava_id', true));
create policy "sessions_delete_own" on public.champion_sessions for delete
  using (user_strava_id = current_setting('app.strava_id', true));

-- Zones: anyone can read, owner can insert, anyone can update usage_count
create policy "zones_read_all"      on public.zones for select using (true);
create policy "zones_insert_own"    on public.zones for insert
  with check (created_by = current_setting('app.strava_id', true));
create policy "zones_update_usage"  on public.zones for update using (true);

-- TIER UPGRADE REQUESTS
create table if not exists public.tier_upgrade_requests (
  id                    bigserial primary key,
  user_strava_id        text not null references public.users(strava_id) on delete cascade,
  current_tier          int not null check (current_tier in (200, 400, 600, 800, 1000)),
  requested_tier        int not null check (requested_tier in (200, 400, 600, 800, 1000)),
  month_key             text not null check (month_key ~ '^\d{4}-\d{2}$'),
  monthly_km            int not null default 0,
  status                text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at          timestamptz not null default now(),
  decided_at            timestamptz,
  decided_by            text references public.users(strava_id) on delete set null,
  effective_on          date not null,
  applied_at            timestamptz,
  admin_note            text default ''
);

create unique index if not exists idx_tier_upgrade_pending_unique
  on public.tier_upgrade_requests (user_strava_id, month_key)
  where status = 'pending';

create index if not exists idx_tier_upgrade_status
  on public.tier_upgrade_requests(status, effective_on);

create index if not exists idx_tier_upgrade_decided_by
  on public.tier_upgrade_requests(decided_by)
  where decided_by is not null;

alter table public.tier_upgrade_requests enable row level security;

grant select, insert, update, delete
  on public.tier_upgrade_requests
  to authenticated;

grant usage, select
  on sequence public.tier_upgrade_requests_id_seq
  to authenticated;

drop policy if exists "tier_upgrade_read_own" on public.tier_upgrade_requests;
drop policy if exists "tier_upgrade_insert_own" on public.tier_upgrade_requests;

create policy "tier_upgrade_read_own" on public.tier_upgrade_requests for select
  using (user_strava_id = (select current_setting('app.strava_id', true)));

create policy "tier_upgrade_insert_own" on public.tier_upgrade_requests for insert
  with check (user_strava_id = (select current_setting('app.strava_id', true)));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id              bigserial primary key,
  user_strava_id  text not null references public.users(strava_id) on delete cascade,
  type            text not null default 'info',   -- 'welcome' | 'info' | 'achievement'
  title           text not null,
  body            text not null,
  dismissed_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz default now()
);

alter table public.notifications enable row level security;
create policy "notifs_read_all" on public.notifications for select using (true);
grant select on public.notifications to anon;
grant select, insert, update, delete on public.notifications to authenticated;
grant usage, select on sequence public.notifications_id_seq to authenticated;

-- Enable Supabase Realtime on notifications
alter publication supabase_realtime add table public.notifications;

-- ============================================================
-- BETA FEEDBACK BOARD
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

-- ============================================================
-- ADMIN SETUP
-- After your first Strava login, run this to grant yourself admin:
--   UPDATE public.users SET role = 'admin' WHERE strava_id = '<your_strava_id>';
-- ============================================================
