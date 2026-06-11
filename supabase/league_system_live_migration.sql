-- SpinTribe 26 league system live migration
-- Safe to run more than once against the production Supabase database.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  min_km      int not null,
  max_km      int,
  created_at  timestamptz default now()
);

insert into public.leagues (name, min_km, max_km)
values
  ('200 Club', 0, 299),
  ('400 Club', 300, 499),
  ('600 Club', 500, 799),
  ('800 Club', 800, 1199),
  ('1000 Club', 1200, null)
on conflict (name) do update
set min_km = excluded.min_km,
    max_km = excluded.max_km;

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  logo_url    text,
  banner_url  text,
  description text,
  created_by  text references public.users(strava_id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

insert into public.teams (name, slug, description)
values (
  'Team Vitality',
  'team-vitality',
  'Initial SpinTribe seed team. The platform supports many teams.'
)
on conflict (slug) do nothing;

alter table public.users
  add column if not exists team_id uuid,
  add column if not exists current_league_id uuid,
  add column if not exists current_league_name text,
  add column if not exists current_league_threshold int;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_team_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_team_id_fkey
      foreign key (team_id) references public.teams(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_current_league_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_current_league_id_fkey
      foreign key (current_league_id) references public.leagues(id) on delete set null;
  end if;
end;
$$;

alter table public.activities
  add column if not exists elevation_gain numeric not null default 0;

create table if not exists public.league_memberships (
  id                        bigserial primary key,
  user_strava_id            text not null references public.users(strava_id) on delete cascade,
  league_id                 uuid not null references public.leagues(id) on delete cascade,
  month_key                 text not null check (month_key ~ '^\d{4}-\d{2}$'),
  start_date                date not null,
  end_date                  date not null,
  assigned_km               int not null,
  assigned_league_name      text not null,
  assigned_league_threshold int not null,
  promoted_from_league_id   uuid references public.leagues(id) on delete set null,
  relegated_from_league_id  uuid references public.leagues(id) on delete set null,
  created_at                timestamptz default now(),
  unique (user_strava_id, month_key)
);

create table if not exists public.monthly_league_standings (
  id                  bigserial primary key,
  user_strava_id      text not null references public.users(strava_id) on delete cascade,
  league_id           uuid not null references public.leagues(id) on delete cascade,
  month_key           text not null check (month_key ~ '^\d{4}-\d{2}$'),
  total_km            numeric not null,
  total_elevation     numeric not null,
  ride_count          int not null,
  active_days         int not null,
  longest_ride_km     numeric not null,
  rank_distance       int,
  rank_elevation      int,
  rank_consistency    int,
  rank_ride_count     int,
  rank_longest_ride   int,
  created_at          timestamptz default now(),
  unique (user_strava_id, league_id, month_key)
);

create index if not exists idx_activities_user_date
  on public.activities(user_strava_id, date);
create index if not exists idx_users_team
  on public.users(team_id);
create index if not exists idx_users_current_league
  on public.users(current_league_id);
create index if not exists idx_league_memberships_user_month
  on public.league_memberships(user_strava_id, month_key);
create index if not exists idx_league_memberships_league_month
  on public.league_memberships(league_id, month_key);
create index if not exists idx_monthly_standings_league_month_distance
  on public.monthly_league_standings(league_id, month_key, rank_distance);
create index if not exists idx_monthly_standings_user_month
  on public.monthly_league_standings(user_strava_id, month_key);

update public.users u
set current_league_name = coalesce(u.current_league_name, l.name),
    current_league_threshold = coalesce(u.current_league_threshold, u.tier),
    current_league_id = coalesce(u.current_league_id, l.id)
from public.leagues l
where l.name = concat(coalesce(u.tier, 400), ' Club');

revoke select on public.users from anon, authenticated;

grant select (
  strava_id,
  name,
  avatar,
  role,
  tier,
  team_id,
  current_league_id,
  current_league_name,
  current_league_threshold,
  onboarded,
  zone,
  ftp,
  ftp_cached_at,
  country,
  leaderboard_consent,
  rewards_export_consent,
  created_at,
  updated_at
)
on public.users
to anon, authenticated;

grant select
  on public.teams, public.leagues, public.monthly_league_standings
  to anon, authenticated;

grant select
  on public.league_memberships
  to authenticated;

grant select, insert, update, delete
  on public.teams, public.league_memberships, public.monthly_league_standings
  to authenticated;

grant usage, select
  on sequence public.league_memberships_id_seq, public.monthly_league_standings_id_seq
  to authenticated;

alter table public.teams enable row level security;
alter table public.leagues enable row level security;
alter table public.league_memberships enable row level security;
alter table public.monthly_league_standings enable row level security;

drop policy if exists "teams_read_all" on public.teams;
drop policy if exists "teams_insert_own" on public.teams;
drop policy if exists "teams_update_own" on public.teams;
drop policy if exists "leagues_read_all" on public.leagues;
drop policy if exists "league_memberships_read_own" on public.league_memberships;
drop policy if exists "league_memberships_insert_own" on public.league_memberships;
drop policy if exists "monthly_league_standings_read_all" on public.monthly_league_standings;

create policy "teams_read_all" on public.teams for select using (true);
create policy "teams_insert_own" on public.teams for insert
  with check (created_by = current_setting('app.strava_id', true));
create policy "teams_update_own" on public.teams for update
  using (created_by = current_setting('app.strava_id', true));

create policy "leagues_read_all" on public.leagues for select using (true);

create policy "league_memberships_read_own" on public.league_memberships for select
  using (user_strava_id = current_setting('app.strava_id', true));
create policy "league_memberships_insert_own" on public.league_memberships for insert
  with check (user_strava_id = current_setting('app.strava_id', true));

create policy "monthly_league_standings_read_all" on public.monthly_league_standings for select using (true);
