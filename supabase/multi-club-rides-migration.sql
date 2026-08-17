-- Multi-club community ride rail.
--
-- Canonical club membership lives in team_memberships. users.role remains a
-- platform-level role (admin/member); it is no longer the source of truth for
-- whether someone is a champ of a club. users.team_id may continue to identify
-- one primary leaderboard team, but MUST NOT be used for club authorization.
--
-- This migration is intentionally independent of coaching and payments. All
-- foreign keys terminate at users, teams, team_rides, ride_checkins, or
-- ride_feedback. Browser clients receive no direct access to team_memberships
-- or the ride tables; server routes use the service role.

create extension if not exists pgcrypto;

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  user_strava_id text not null references public.users(strava_id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'champion')),
  is_primary boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_strava_id, team_id)
);

create unique index if not exists team_memberships_one_primary_per_user
  on public.team_memberships(user_strava_id)
  where is_primary;

create index if not exists team_memberships_team_role_idx
  on public.team_memberships(team_id, role, user_strava_id);

alter table public.team_memberships enable row level security;
revoke all on table public.team_memberships from anon, authenticated;
grant all on table public.team_memberships to service_role;

alter table public.team_rides
  add column if not exists team_id uuid,
  add column if not exists meeting_point text,
  add column if not exists created_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_rides_team_id_fkey'
      and conrelid = 'public.team_rides'::regclass
  ) then
    alter table public.team_rides
      add constraint team_rides_team_id_fkey
      foreign key (team_id) references public.teams(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'team_rides_created_by_fkey'
      and conrelid = 'public.team_rides'::regclass
  ) then
    alter table public.team_rides
      add constraint team_rides_created_by_fkey
      foreign key (created_by) references public.users(strava_id) on delete set null;
  end if;
end $$;

-- Team Vitality is the first club and is already seeded by the base schema.
-- Existing single-club rides and champions become Team Vitality records.
with vitality as (
  select id from public.teams where slug = 'team-vitality' limit 1
)
update public.team_rides r
set team_id = v.id
from vitality v
where r.team_id is null;

-- Preserve users.team_id as the rider's one primary leaderboard attribution,
-- but copy it into the canonical membership table. The membership table is the
-- authority for club participation and club roles from this point forward.
insert into public.team_memberships (user_strava_id, team_id, role, is_primary)
select
  u.strava_id,
  u.team_id,
  case when u.role = 'champion' then 'champion' else 'member' end,
  true
from public.users u
where u.team_id is not null
on conflict (user_strava_id, team_id) do update
set
  role = case
    when excluded.role = 'champion' then 'champion'
    else public.team_memberships.role
  end,
  is_primary = excluded.is_primary,
  updated_at = now();

-- Historical champions without a team belonged to the original Team Vitality
-- pilot. Backfill them into that club without requiring a second schema change.
insert into public.team_memberships (user_strava_id, team_id, role, is_primary)
select
  u.strava_id,
  v.id,
  'champion',
  not exists (
    select 1 from public.team_memberships existing
    where existing.user_strava_id = u.strava_id and existing.is_primary
  )
from public.users u
cross join lateral (
  select id from public.teams where slug = 'team-vitality' limit 1
) v
where u.role = 'champion'
on conflict (user_strava_id, team_id) do update
set role = 'champion', updated_at = now();

-- users.role is now platform-wide only. Club champion privileges are resolved
-- from team_memberships.role = 'champion'. Admin remains a global override.
update public.users
set role = 'member', updated_at = now()
where role = 'champion';

-- A ride must belong to exactly one club after the legacy backfill succeeds.
do $$
begin
  if exists (select 1 from public.team_rides where team_id is null) then
    raise exception 'team_rides contains unscoped rows; Team Vitality seed is missing';
  end if;
end $$;

alter table public.team_rides alter column team_id set not null;

-- Capacity stays non-null for compatibility. Omitting capacity in the UI/API
-- means the existing 20-rider default; creation routes cap explicit values at
-- 100. The DB constraint prevents a bypass through future server code.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_rides_capacity_sane'
      and conrelid = 'public.team_rides'::regclass
  ) then
    alter table public.team_rides
      add constraint team_rides_capacity_sane check (capacity between 1 and 100) not valid;
    alter table public.team_rides validate constraint team_rides_capacity_sane;
  end if;
end $$;

create index if not exists team_rides_team_starts_idx
  on public.team_rides(team_id, starts_at);
create index if not exists team_rides_creator_created_idx
  on public.team_rides(created_by, created_at desc)
  where created_by is not null;

-- Reassert the original browser-closed security boundary, including the newly
-- introduced membership table. The service role bypasses RLS in server routes.
alter table public.team_rides enable row level security;
alter table public.ride_checkins enable row level security;
alter table public.ride_feedback enable row level security;
revoke all on table public.team_rides, public.ride_checkins, public.ride_feedback from anon, authenticated;
grant all on table public.team_rides, public.ride_checkins, public.ride_feedback to service_role;
