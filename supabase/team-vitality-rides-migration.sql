-- Team Vitality scheduled rides and participation.
-- UNAPPLIED: review in Supabase SQL Editor before running.
-- Membership remains users.role = 'champion'; there is intentionally no champs table.
-- No FK in this migration points to lesson_purchases, lesson_sessions,
-- lesson_services, or any PayFast/payment record.

create table if not exists public.team_rides (
  id           uuid primary key default gen_random_uuid(),
  starts_at    timestamptz not null,
  route        text not null,
  capacity     integer not null default 20 check (capacity > 0),
  captain_id   text references public.users(strava_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.ride_checkins (
  id             uuid primary key default gen_random_uuid(),
  ride_id        uuid not null references public.team_rides(id) on delete cascade,
  champ_id       text not null references public.users(strava_id) on delete cascade,
  checked_in_at  timestamptz not null default now(),
  unique (ride_id, champ_id)
);

create table if not exists public.ride_feedback (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.team_rides(id) on delete cascade,
  champ_id    text not null references public.users(strava_id) on delete cascade,
  note        text not null check (length(trim(note)) > 0),
  created_at  timestamptz not null default now(),
  unique (ride_id, champ_id)
);

-- RLS is intentionally closed to browser clients. Server routes use supabaseAdmin()
-- and therefore bypass RLS. This keeps private feedback and attendance off public APIs.
alter table public.team_rides enable row level security;
alter table public.ride_checkins enable row level security;
alter table public.ride_feedback enable row level security;

-- There are deliberately no anon/authenticated policies on these tables.
-- Service-role access is required for reads and writes.

create index if not exists team_rides_starts_at_idx
  on public.team_rides(starts_at);

create index if not exists ride_checkins_ride_id_idx
  on public.ride_checkins(ride_id);

create index if not exists ride_feedback_ride_id_idx
  on public.ride_feedback(ride_id);
