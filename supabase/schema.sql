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
  tier                  int  not null default 200,        -- 200 | 400 | 800 | 1000
  strava_access_token   text,
  strava_refresh_token  text,
  strava_token_expires_at bigint,
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
-- ROW LEVEL SECURITY
-- All writes go through supabaseAdmin (service role) in API routes,
-- which bypasses RLS. RLS policies here protect direct anon-key access.
-- ============================================================
alter table public.users             enable row level security;
alter table public.activities        enable row level security;
alter table public.champion_sessions enable row level security;
alter table public.zones             enable row level security;

-- Users: anyone can read (leaderboard needs it), only owner can update
create policy "users_read_all"   on public.users for select using (true);
create policy "users_update_own" on public.users for update
  using (strava_id = current_setting('app.strava_id', true));

-- Activities: anyone can read (leaderboard), only owner can insert/update
create policy "activities_read_all"   on public.activities for select using (true);
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

-- ============================================================
-- ADMIN SETUP
-- After your first Strava login, run this to grant yourself admin:
--   UPDATE public.users SET role = 'admin' WHERE strava_id = '<your_strava_id>';
-- ============================================================
