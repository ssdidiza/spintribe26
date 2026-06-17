-- SpinTribe26 — Fast-track in-month promotions migration
-- Safe to run more than once against the production Supabase database.
--
-- Records every promotion a rider earns (in-month fast-track, or month-end
-- monthly assignment) so the Profile "League Journey" can show the full path
-- (e.g. June: 200 Club -> 400 Club -> 600 Club). The unique constraint on
-- (user_strava_id, month_key, to_league_threshold) makes promotion writes
-- idempotent: duplicate Strava sync/webhook deliveries cannot create duplicate
-- promotion history rows.

create table if not exists public.league_promotion_events (
  id                     bigserial primary key,
  user_strava_id         text not null references public.users(strava_id) on delete cascade,
  month_key              text not null check (month_key ~ '^\d{4}-\d{2}$'),
  from_league_threshold  int,
  to_league_threshold    int not null check (to_league_threshold in (200, 400, 600, 800, 1000)),
  from_league_name       text,
  to_league_name         text not null,
  km_at_promotion        int not null default 0,
  kind                   text not null default 'fast_track' check (kind in ('fast_track', 'monthly')),
  created_at             timestamptz default now(),
  unique (user_strava_id, month_key, to_league_threshold)
);

create index if not exists idx_promotion_events_user_month
  on public.league_promotion_events(user_strava_id, month_key);

alter table public.league_promotion_events enable row level security;

-- Reads go through API routes (service role). The read-all policy mirrors
-- monthly_league_standings; the Profile journey only ever requests the
-- signed-in rider's own rows via the API.
drop policy if exists "promotion_events_read_all" on public.league_promotion_events;
create policy "promotion_events_read_all"
  on public.league_promotion_events for select using (true);

grant select on public.league_promotion_events to anon, authenticated;
grant select, insert, update, delete on public.league_promotion_events to authenticated;
grant usage, select on sequence public.league_promotion_events_id_seq to authenticated;
