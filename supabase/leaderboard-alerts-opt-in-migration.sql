-- ============================================================
-- SpinTribe26 - Leaderboard alerts + default opt-in
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

alter table public.users
  add column if not exists leaderboard_consent boolean not null default true,
  add column if not exists rewards_export_consent boolean not null default true,
  alter column leaderboard_consent set default true,
  alter column rewards_export_consent set default true;

update public.users
set
  leaderboard_consent = true,
  rewards_export_consent = true,
  updated_at = now()
where onboarded = true;

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists idx_notifications_dedupe_key
  on public.notifications (dedupe_key);
