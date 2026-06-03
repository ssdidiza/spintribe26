-- ============================================================
-- SpinTribe26 - Rewards eligibility + tier upgrade requests
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

alter table public.users
  add column if not exists ftp_cached_at timestamptz,
  add column if not exists rewards_export_consent boolean not null default false;

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

grant select (strava_id, name, avatar, role, tier, onboarded, zone, ftp, ftp_cached_at, country, rewards_export_consent, leaderboard_consent, created_at, updated_at)
  on public.users
  to anon, authenticated;

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
