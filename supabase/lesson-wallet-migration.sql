-- ============================================================
-- Lesson wallet, bookings, and payment reconciliation
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.integration_credentials (
  provider       text primary key,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  tenant_id      text,
  updated_at     timestamptz not null default now()
);

alter table public.integration_credentials enable row level security;
revoke all on public.integration_credentials from anon, authenticated;
grant all on public.integration_credentials to service_role;

create table if not exists public.lesson_purchases (
  id                          uuid primary key default gen_random_uuid(),
  user_strava_id              text not null references public.users(strava_id) on delete cascade,
  created_by                  text references public.users(strava_id) on delete set null,
  lesson_count                numeric(8,2) not null check (lesson_count > 0),
  unit_price_cents            int not null default 39900 check (unit_price_cents >= 0),
  discount_percent            numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  gross_amount_cents          int not null check (gross_amount_cents >= 0),
  discount_amount_cents       int not null default 0 check (discount_amount_cents >= 0),
  total_amount_cents          int not null check (total_amount_cents >= 0),
  currency                    text not null default 'ZAR',
  status                      text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'paid', 'cancelled')),
  description                 text default '',
  xero_invoice_id             text,
  xero_invoice_number         text,
  xero_invoice_url            text,
  xero_sync_status            text not null default 'not_configured'
    check (xero_sync_status in ('not_configured', 'pending', 'synced', 'error')),
  xero_error                  text,
  customer_email              text,
  payfast_reference           text,
  payfast_checkout_url        text,
  payfast_payment_id          text,
  payfast_paid_at             timestamptz,
  payfast_metadata            jsonb,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Safe to re-run if an earlier lesson-wallet draft was already applied.
alter table public.lesson_purchases add column if not exists customer_email text;
alter table public.lesson_purchases add column if not exists payfast_reference text;
alter table public.lesson_purchases add column if not exists payfast_checkout_url text;
alter table public.lesson_purchases add column if not exists payfast_payment_id text;
alter table public.lesson_purchases add column if not exists payfast_paid_at timestamptz;
alter table public.lesson_purchases add column if not exists payfast_metadata jsonb;

create table if not exists public.lesson_sessions (
  id                        uuid primary key default gen_random_uuid(),
  purchase_id               uuid references public.lesson_purchases(id) on delete set null,
  user_strava_id            text not null references public.users(strava_id) on delete cascade,
  coach_strava_id           text references public.users(strava_id) on delete set null,
  status                    text not null default 'booked'
    check (status in ('booked', 'completed', 'cancelled', 'no_show', 'coach_cancelled')),
  starts_at                 timestamptz not null,
  ends_at                   timestamptz not null,
  duration_minutes          int not null default 60 check (duration_minutes > 0),
  credit_amount             numeric(8,2) not null default 1 check (credit_amount >= 0),
  location                  text default '',
  notes                     text default '',
  client_notes              text default '',
  google_calendar_event_id  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.lesson_credit_ledger (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid references public.lesson_purchases(id) on delete set null,
  session_id        uuid references public.lesson_sessions(id) on delete set null,
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  event_type        text not null
    check (event_type in ('purchase_activated', 'booking_hold', 'booking_released', 'session_completed', 'late_cancel', 'no_show', 'adjustment')),
  credit_delta      numeric(8,2) not null,
  reason            text default '',
  created_by        text references public.users(strava_id) on delete set null,
  created_at        timestamptz not null default now(),
  metadata          jsonb
);

create index if not exists idx_lesson_purchases_user_created
  on public.lesson_purchases(user_strava_id, created_at desc);
create index if not exists idx_lesson_purchases_status
  on public.lesson_purchases(status, created_at desc);
create unique index if not exists idx_lesson_purchases_payfast_reference
  on public.lesson_purchases(payfast_reference)
  where payfast_reference is not null;

create index if not exists idx_lesson_sessions_user_starts
  on public.lesson_sessions(user_strava_id, starts_at desc);
create index if not exists idx_lesson_sessions_status_starts
  on public.lesson_sessions(status, starts_at asc);

create index if not exists idx_lesson_ledger_user_created
  on public.lesson_credit_ledger(user_strava_id, created_at desc);
create index if not exists idx_lesson_ledger_purchase
  on public.lesson_credit_ledger(purchase_id);
create index if not exists idx_lesson_ledger_session
  on public.lesson_credit_ledger(session_id);

alter table public.lesson_purchases enable row level security;
alter table public.lesson_sessions enable row level security;
alter table public.lesson_credit_ledger enable row level security;

grant select, insert, update, delete
  on public.lesson_purchases, public.lesson_sessions, public.lesson_credit_ledger
  to authenticated;

drop policy if exists "lesson_purchases_read_own" on public.lesson_purchases;
drop policy if exists "lesson_sessions_read_own" on public.lesson_sessions;
drop policy if exists "lesson_ledger_read_own" on public.lesson_credit_ledger;

create policy "lesson_purchases_read_own" on public.lesson_purchases for select
  to authenticated
  using (user_strava_id = (select current_setting('app.strava_id', true)));

create policy "lesson_sessions_read_own" on public.lesson_sessions for select
  to authenticated
  using (user_strava_id = (select current_setting('app.strava_id', true)));

create policy "lesson_ledger_read_own" on public.lesson_credit_ledger for select
  to authenticated
  using (user_strava_id = (select current_setting('app.strava_id', true)));
