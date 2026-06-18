-- SpinTribe 26 — Race Library + Race Pace Planner migration
-- Safe to run more than once against the production Supabase database.
--
-- Adds:
--   * public.races       — admin-maintained race catalogue (riders never write).
--   * public.race_plans  — a rider's PRIVATE pace plans (one per race per rider).
--
-- Privacy: race_plans are private to their owner. The app reads/writes them with
-- the service role (which bypasses RLS), so the ownership filter lives in the
-- route code; the RLS policies below are defense-in-depth for any direct access.

create extension if not exists pgcrypto with schema extensions;

-- ─── races (admin-maintained catalogue) ──────────────────────────────────────
create table if not exists public.races (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  country       text not null default 'South Africa',
  province      text,
  city          text,
  -- Exact date when known; otherwise leave null and use year_label.
  race_date     date,
  year_label    text,
  distance_km   numeric not null,
  elevation_m   numeric not null default 0,
  difficulty    text not null default 'moderate'
                  check (difficulty in ('easy', 'moderate', 'hard', 'extreme')),
  route_type    text not null default 'road'
                  check (route_type in ('road', 'mtb', 'gravel', 'mixed')),
  segments_json jsonb not null default '[]'::jsonb,
  -- false => the route figures are conservative admin-maintained placeholders.
  data_verified boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── race_plans (per-rider, private) ─────────────────────────────────────────
create table if not exists public.race_plans (
  id                    uuid primary key default gen_random_uuid(),
  user_strava_id        text not null references public.users(strava_id) on delete cascade,
  race_id               uuid not null references public.races(id) on delete cascade,
  target_mode           text not null
                          check (target_mode in ('conservative', 'realistic', 'aggressive', 'custom')),
  -- Only set for the custom finish-time mode.
  custom_finish_minutes int,
  -- Frozen snapshot of the generated plan (targets, segment pacing, warnings).
  plan_json             jsonb not null,
  readiness_status      text not null
                          check (readiness_status in ('ready', 'on_track', 'building', 'early')),
  readiness_score       int not null default 0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  -- One plan per race per rider — regenerating updates the existing row.
  unique (user_strava_id, race_id)
);

create index if not exists idx_races_active on public.races(is_active);
create index if not exists idx_race_plans_user on public.race_plans(user_strava_id);
create index if not exists idx_race_plans_race on public.race_plans(race_id);

-- ─── Seed: curated South African races ───────────────────────────────────────
-- Route figures below are CONSERVATIVE PLACEHOLDERS (data_verified = false) and
-- are admin-maintained — refine distance_km / elevation_m / segments_json in
-- Supabase as exact route data is confirmed. `on conflict do nothing` so a
-- re-run never clobbers admin edits.
insert into public.races
  (slug, name, country, province, city, year_label, distance_km, elevation_m, difficulty, route_type, segments_json, data_verified, is_active)
values
  (
    '947-ride-joburg',
    '947 Ride Joburg',
    'South Africa', 'Gauteng', 'Johannesburg',
    'November 2026',
    98, 1100, 'hard', 'road',
    '[
      {"name":"Start to Woodmead","distanceKm":18,"elevationM":180,"terrain":"rolling"},
      {"name":"Northern suburbs rollers","distanceKm":25,"elevationM":320,"terrain":"rolling"},
      {"name":"Witkoppen climb","distanceKm":12,"elevationM":260,"terrain":"climb"},
      {"name":"Fourways to Sandton","distanceKm":28,"elevationM":240,"terrain":"rolling"},
      {"name":"Final drag to finish","distanceKm":15,"elevationM":100,"terrain":"flat"}
    ]'::jsonb,
    false, true
  ),
  (
    'cape-town-cycle-tour',
    'Cape Town Cycle Tour',
    'South Africa', 'Western Cape', 'Cape Town',
    'March 2027',
    109, 1100, 'hard', 'road',
    '[
      {"name":"City to Muizenberg","distanceKm":20,"elevationM":80,"terrain":"flat"},
      {"name":"Muizenberg to Simon''s Town","distanceKm":18,"elevationM":160,"terrain":"rolling"},
      {"name":"Smitswinkel climb","distanceKm":10,"elevationM":220,"terrain":"climb"},
      {"name":"Scarborough to Kommetjie","distanceKm":20,"elevationM":180,"terrain":"rolling"},
      {"name":"Chapman''s Peak","distanceKm":12,"elevationM":280,"terrain":"climb"},
      {"name":"Hout Bay to Suikerbossie","distanceKm":9,"elevationM":180,"terrain":"climb"},
      {"name":"Suikerbossie to finish","distanceKm":20,"elevationM":0,"terrain":"descent"}
    ]'::jsonb,
    false, true
  ),
  (
    'amashova-durban-classic',
    'Amashova Durban Classic',
    'South Africa', 'KwaZulu-Natal', 'Pietermaritzburg to Durban',
    'October 2026',
    106, 900, 'moderate', 'road',
    '[
      {"name":"PMB rollout","distanceKm":15,"elevationM":160,"terrain":"rolling"},
      {"name":"Climbs out of PMB","distanceKm":12,"elevationM":220,"terrain":"climb"},
      {"name":"Cato Ridge descent","distanceKm":20,"elevationM":60,"terrain":"descent"},
      {"name":"Drummond rollers","distanceKm":24,"elevationM":260,"terrain":"rolling"},
      {"name":"Hillcrest to Kloof","distanceKm":15,"elevationM":140,"terrain":"rolling"},
      {"name":"Field''s Hill descent","distanceKm":8,"elevationM":20,"terrain":"descent"},
      {"name":"Pinetown to Durban beachfront","distanceKm":12,"elevationM":40,"terrain":"flat"}
    ]'::jsonb,
    false, true
  )
on conflict (slug) do nothing;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Races are public, read-only to clients. Plans are touched only via the service
-- role; grant authenticated CRUD as defense-in-depth alongside RLS below.
grant select on public.races to anon, authenticated;
grant select, insert, update, delete on public.race_plans to authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.races enable row level security;
alter table public.race_plans enable row level security;

drop policy if exists "races_read_active" on public.races;
drop policy if exists "race_plans_read_own" on public.race_plans;
drop policy if exists "race_plans_insert_own" on public.race_plans;
drop policy if exists "race_plans_update_own" on public.race_plans;
drop policy if exists "race_plans_delete_own" on public.race_plans;

-- Anyone may read active races (it's a public catalogue, no rider data).
create policy "races_read_active" on public.races for select using (is_active = true);

-- A rider may only ever see or change their OWN plans.
create policy "race_plans_read_own" on public.race_plans for select
  using (user_strava_id = current_setting('app.strava_id', true));
create policy "race_plans_insert_own" on public.race_plans for insert
  with check (user_strava_id = current_setting('app.strava_id', true));
create policy "race_plans_update_own" on public.race_plans for update
  using (user_strava_id = current_setting('app.strava_id', true));
create policy "race_plans_delete_own" on public.race_plans for delete
  using (user_strava_id = current_setting('app.strava_id', true));
