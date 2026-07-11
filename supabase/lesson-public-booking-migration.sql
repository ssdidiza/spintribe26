-- ============================================================
-- Public lesson booking: guest customers, service catalog,
-- and direct (single-session) bookings that bypass the wallet.
-- Run AFTER lesson-wallet-migration.sql in:
--   Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Service catalog: what the public booking page lists.
-- ------------------------------------------------------------
create table if not exists public.lesson_services (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  description       text default '',
  duration_minutes  int not null default 60 check (duration_minutes > 0),
  price_cents       int not null check (price_cents >= 0),
  currency          text not null default 'ZAR',
  active            boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.lesson_services enable row level security;
grant select on public.lesson_services to anon, authenticated;
revoke insert, update, delete on public.lesson_services from anon, authenticated;
grant select, insert, update, delete on public.lesson_services to service_role;

-- Active services are publicly readable (the booking page is public);
-- writes stay on the service role / admin routes.
drop policy if exists "lesson_services_read_active" on public.lesson_services;
create policy "lesson_services_read_active" on public.lesson_services for select
  to anon, authenticated
  using (active = true);

-- Seed a starter service so the page is never empty. Tune in the admin tab later.
insert into public.lesson_services (slug, name, description, duration_minutes, price_cents, sort_order)
values
  ('intro-60', 'Intro cycling session', 'One-on-one coaching for beginners — bike handling, posture, and confidence on the road.', 60, 39900, 1),
  ('skills-90', 'Skills & training ride', 'A 90-minute guided ride focused on technique, pacing, and building endurance.', 90, 54900, 2)
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- 2. Guest customers on purchases (no Strava account required).
-- ------------------------------------------------------------
alter table public.lesson_purchases alter column user_strava_id drop not null;
alter table public.lesson_purchases add column if not exists customer_name text;
alter table public.lesson_purchases add column if not exists customer_phone text;
alter table public.lesson_purchases add column if not exists service_id uuid references public.lesson_services(id) on delete set null;

-- Direct = a single paid session booked from the public page (no wallet/credits).
-- Package = the existing member wallet flow (credits + ledger).
alter table public.lesson_purchases add column if not exists kind text not null default 'package';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_purchases_kind_check'
  ) then
    alter table public.lesson_purchases
      add constraint lesson_purchases_kind_check check (kind in ('package', 'direct'));
  end if;
end $$;

-- Slot the guest chose; the session is materialised from this on payment confirm.
alter table public.lesson_purchases add column if not exists booking_starts_at timestamptz;
alter table public.lesson_purchases add column if not exists booking_duration_minutes int;
alter table public.lesson_purchases add column if not exists booking_location text;

-- A purchase is now EITHER tied to a member (user_strava_id) OR a guest (name+email).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_purchases_owner_check'
  ) then
    alter table public.lesson_purchases
      add constraint lesson_purchases_owner_check
      check (user_strava_id is not null or (customer_name is not null and customer_email is not null));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Guest customers on sessions.
-- ------------------------------------------------------------
alter table public.lesson_sessions alter column user_strava_id drop not null;
alter table public.lesson_sessions add column if not exists customer_name text;
alter table public.lesson_sessions add column if not exists customer_email text;
alter table public.lesson_sessions add column if not exists customer_phone text;
alter table public.lesson_sessions add column if not exists service_id uuid references public.lesson_services(id) on delete set null;
alter table public.lesson_sessions add column if not exists hold_expires_at timestamptz;

-- A pending public checkout owns its slot for a short period. The same table
-- also contains member bookings, so one exclusion constraint protects every
-- booking path from concurrent overlaps.
alter table public.lesson_sessions drop constraint if exists lesson_sessions_status_check;
alter table public.lesson_sessions
  add constraint lesson_sessions_status_check
  check (status in ('pending_payment', 'booked', 'completed', 'cancelled', 'no_show', 'coach_cancelled'));

create extension if not exists btree_gist with schema extensions;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_sessions_no_active_overlap'
  ) then
    alter table public.lesson_sessions
      add constraint lesson_sessions_no_active_overlap
      exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
      where (status in ('pending_payment', 'booked'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_sessions_owner_check'
  ) then
    alter table public.lesson_sessions
      add constraint lesson_sessions_owner_check
      check (user_strava_id is not null or (customer_name is not null and customer_email is not null));
  end if;
end $$;

create index if not exists idx_lesson_sessions_starts_status
  on public.lesson_sessions(starts_at, status);
create index if not exists idx_lesson_sessions_hold_expiry
  on public.lesson_sessions(hold_expires_at)
  where status = 'pending_payment';

-- ------------------------------------------------------------
-- 4. Coach availability and blackout windows.
-- ------------------------------------------------------------
create table if not exists public.lesson_availability_rules (
  id          uuid primary key default gen_random_uuid(),
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time),
  unique (weekday)
);

create table if not exists public.lesson_blackouts (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text default '',
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.lesson_availability_rules enable row level security;
alter table public.lesson_blackouts enable row level security;
revoke all on public.lesson_availability_rules, public.lesson_blackouts from anon, authenticated;
grant select, insert, update, delete on public.lesson_availability_rules, public.lesson_blackouts to service_role;

insert into public.lesson_availability_rules (weekday, start_time, end_time)
values
  (1, '06:00', '18:00'),
  (2, '06:00', '18:00'),
  (3, '06:00', '18:00'),
  (4, '06:00', '18:00'),
  (5, '06:00', '18:00'),
  (6, '06:00', '13:00')
on conflict (weekday) do nothing;

grant select, insert, update, delete on public.lesson_purchases, public.lesson_sessions, public.lesson_credit_ledger to service_role;

-- ------------------------------------------------------------
-- 5. Explicit links between a rider's own Strava activities and lessons.
-- ------------------------------------------------------------
create table if not exists public.lesson_activity_attributions (
  id                uuid primary key default gen_random_uuid(),
  activity_id       bigint not null references public.activities(id) on delete cascade,
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  session_id        uuid references public.lesson_sessions(id) on delete set null,
  attributed_by     text references public.users(strava_id) on delete set null,
  source            text not null default 'admin' check (source in ('admin', 'student')),
  notes             text default '',
  created_at        timestamptz not null default now(),
  unique (activity_id)
);

create index if not exists idx_lesson_activity_attributions_user
  on public.lesson_activity_attributions(user_strava_id, created_at desc);
create index if not exists idx_lesson_activity_attributions_session
  on public.lesson_activity_attributions(session_id)
  where session_id is not null;

alter table public.lesson_activity_attributions enable row level security;
revoke all on public.lesson_activity_attributions from anon, authenticated;
grant select, insert, update, delete on public.lesson_activity_attributions to service_role;
