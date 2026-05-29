-- ============================================================
-- SpinTribe26 - Strava Developer Approval Hardening
-- Run in Supabase SQL Editor before deploying the matching app code.
-- ============================================================

alter table public.users
  add column if not exists ftp int,
  add column if not exists ftp_cached_at timestamptz,
  add column if not exists country text,
  add column if not exists last_strava_sync_at timestamptz,
  add column if not exists last_strava_sync_year int,
  add column if not exists last_strava_sync_month int;

alter table public.activities
  add column if not exists detected_zone_id text;

-- Prevent browser-side Supabase clients from selecting stored Strava tokens.
-- API routes continue to use the service role for token refresh and sync.
revoke select on public.users from anon, authenticated;
grant select (strava_id, name, avatar, role, tier, onboarded, zone, ftp, country, created_at, updated_at)
  on public.users
  to anon, authenticated;

-- Raw Strava activity rows are no longer globally readable. The app should
-- expose only the current athlete's detailed rides and aggregate leaderboard
-- data needed for the Team Vitality monthly challenge.
drop policy if exists "activities_read_all" on public.activities;
drop policy if exists "activities_read_own" on public.activities;
create policy "activities_read_own" on public.activities for select
  using (user_strava_id = current_setting('app.strava_id', true));

-- Keep explicit indexes for cached monthly sync reads.
create index if not exists idx_activities_user_date
  on public.activities(user_strava_id, date desc);
