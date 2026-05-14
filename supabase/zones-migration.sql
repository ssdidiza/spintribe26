-- ============================================================
-- SpinTribe26 — Zones Migration
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ZONES
create table if not exists public.zones (
  id              bigserial primary key,
  name            text not null,
  region          text not null,
  type            text not null default 'geographic', -- 'geographic' | 'training'
  description     text default '',
  created_by      text not null references public.users(strava_id) on delete cascade,
  created_by_name text not null default '',
  usage_count     int  default 0,
  created_at      timestamptz default now()
);

-- Unique zone name per region (case-insensitive)
create unique index if not exists idx_zones_name_region
  on public.zones (lower(name), lower(region));

-- Update champion_sessions to include zone + activity proof
alter table public.champion_sessions
  add column if not exists zone_id          bigint references public.zones(id) on delete set null,
  add column if not exists zone_name        text,
  add column if not exists strava_activity_id   text,
  add column if not exists strava_activity_name text,
  add column if not exists strava_activity_km   int;

-- Indexes
create index if not exists idx_zones_region on public.zones(region);

-- RLS
alter table public.zones enable row level security;

-- Explicit grants (required from May 30 2026 for new projects)
grant select on public.zones to anon;
grant select, insert, update, delete on public.zones to authenticated;
grant usage, select on sequence public.zones_id_seq to authenticated;

create policy "zones_read_all" on public.zones for select using (true);
create policy "zones_insert_own" on public.zones for insert
  with check (created_by = current_setting('app.strava_id', true));
create policy "zones_update_count" on public.zones for update
  using (true); -- usage_count updated by any authenticated session

-- Seed default zones
insert into public.zones (name, region, type, description, created_by, created_by_name, usage_count) values
  ('Cradle Descent', 'Gauteng', 'geographic', 'Weekly climb from Muldersdrift toward the Cradle of Humankind', 'system', 'SpinTribe', 14),
  ('Suikerbosrand Loop', 'Gauteng', 'geographic', '60km weekend loop through the nature reserve', 'system', 'SpinTribe', 9),
  ('Chapman''s Peak Classic', 'Western Cape', 'geographic', 'Coastal route — Hout Bay to Noordhoek and back', 'system', 'SpinTribe', 21),
  ('FTP Block Sessions', 'National', 'training', 'Indoor structured 4×8min FTP intervals', 'system', 'SpinTribe', 31),
  ('Valley of Ales Climb', 'KwaZulu-Natal', 'geographic', 'Epic hillside route above the Valley of a Thousand Hills', 'system', 'SpinTribe', 7)
on conflict do nothing;
