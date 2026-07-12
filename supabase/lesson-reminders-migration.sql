-- ============================================================
-- WhatsApp lesson reminders: durable queue rows enqueued when a
-- direct booking is confirmed (PayFast ITN), drained by the cron
-- route /api/lessons/reminders/send.
-- Run AFTER lesson-public-booking-migration.sql in:
--   Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (idempotent).
-- ============================================================

create table if not exists public.lesson_reminders (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.lesson_sessions(id) on delete cascade,
  channel             text not null default 'whatsapp' check (channel in ('whatsapp')),
  kind                text not null check (kind in ('reminder_24h', 'reminder_1h')),
  scheduled_for       timestamptz not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  -- Rider-typed booking fields only (name, phone, service, time, meeting
  -- point, goal). Never Strava metrics.
  payload             jsonb not null default '{}'::jsonb,
  attempts            int not null default 0,
  provider_message_id text,
  sent_at             timestamptz,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One reminder of each kind per session per channel; lets the ITN
  -- handler re-enqueue idempotently when PayFast retries.
  unique (session_id, channel, kind)
);

create index if not exists idx_lesson_reminders_due
  on public.lesson_reminders(scheduled_for)
  where status = 'pending';

create index if not exists idx_lesson_reminders_session
  on public.lesson_reminders(session_id);

alter table public.lesson_reminders enable row level security;
revoke all on public.lesson_reminders from anon, authenticated;
grant select, insert, update, delete on public.lesson_reminders to service_role;
