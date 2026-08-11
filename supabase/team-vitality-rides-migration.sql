-- ============================================================
-- PROPOSED — NOT YET APPLIED. For review only.
--
-- Team Vitality rides: scheduled club rides, captaincy,
-- attendance check-in, and private post-ride feedback.
--
-- Zero relation to lesson_purchases / lesson_sessions /
-- lesson_services / PayFast. Nothing here is paid.
--
-- Run AFTER schema.sql in:
--   Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (idempotent).
--
-- ------------------------------------------------------------
-- ONE DELIBERATE DEVIATION FROM THE BRIEF — read this first.
--
-- The brief asks for a `champs` table as a new free membership
-- tier. This migration does NOT create one, because the tier
-- already exists:
--
--   users.role  text not null default 'member'
--               -- 'champion' | 'member' | 'admin'   (schema.sql:32)
--
-- with lib/types.ts UserRole, canAccessChampionFeatures(),
-- lib/admin-auth.ts VALID_ROLES, the /champion page, and
-- public.champion_sessions all already keyed to it. A `champs`
-- table would be a second membership system beside that one —
-- the dual system AGENTS.md explicitly forbids.
--
-- So: a champ is users.role = 'champion'. This migration adds
-- only what genuinely does not exist — scheduled rides,
-- captaincy, attendance, feedback.
--
-- To get the literal `champs` table instead, say so and I'll
-- rewrite; it is a bigger change, not a smaller one, because
-- every existing champion surface has to be migrated onto it.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Why the lesson_sessions exclusion constraint is irrelevant.
--
--    lesson_sessions_no_active_overlap is declared ON
--    public.lesson_sessions (lesson-public-booking-migration.sql:108):
--
--      exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
--        where (status in ('pending_payment','booked'))
--
--    A Postgres exclusion constraint is scoped to the single
--    table it is declared on. public.team_rides is a new table
--    with no inheritance from and no foreign key to
--    lesson_sessions, so the constraint cannot see or reject
--    rows here. Many riders may share one team ride slot, and a
--    team ride may overlap a paid coaching session, with no
--    database conflict. Confirmed, not assumed.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 1. Scheduled club rides.
--    champion_sessions logs a ride that already happened and is
--    backed by a Strava activity. Nothing in the schema
--    represents a ride scheduled in advance — that is this table.
-- ------------------------------------------------------------
create table if not exists public.team_rides (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid references public.teams(id) on delete cascade,
  title             text not null,
  route             text default '',
  meeting_point     text default '',
  starts_at         timestamptz not null,
  duration_minutes  int not null default 90 check (duration_minutes > 0),
  capacity          int check (capacity is null or capacity > 0),
  -- First claim wins. Claim atomically in the route handler with
  --   update team_rides set captain_id = $1
  --    where id = $2 and captain_id is null
  -- and treat a zero-row result as "already captained". A single
  -- nullable column is what makes one-captain-per-ride structural.
  captain_id        text references public.users(strava_id) on delete set null,
  captain_claimed_at timestamptz,
  status            text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  created_by        text references public.users(strava_id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_team_rides_starts_at
  on public.team_rides(starts_at desc)
  where status = 'scheduled';

create index if not exists idx_team_rides_captain
  on public.team_rides(captain_id)
  where captain_id is not null;

comment on table public.team_rides is
  'Scheduled Team Vitality club rides. Free — no relation to lesson_* or PayFast.';

-- ------------------------------------------------------------
-- 2. Attendance.
--    One row per rider per ride. The unique index makes the
--    check-in button idempotent under double-tap and retry.
-- ------------------------------------------------------------
create table if not exists public.ride_checkins (
  id                uuid primary key default gen_random_uuid(),
  ride_id           uuid not null references public.team_rides(id) on delete cascade,
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  checked_in_at     timestamptz not null default now(),
  unique (ride_id, user_strava_id)
);

create index if not exists idx_ride_checkins_ride
  on public.ride_checkins(ride_id, checked_in_at);

create index if not exists idx_ride_checkins_user
  on public.ride_checkins(user_strava_id, checked_in_at desc);

comment on table public.ride_checkins is
  'Attendance at a scheduled team ride. Distinct from champion_sessions, '
  'which is Strava-activity-backed zone-ride proof for reward eligibility. '
  'This one needs no Strava account.';

-- ------------------------------------------------------------
-- 3. Private post-ride feedback. Admin-only, one free-text field.
--    No rating column and no rated-rider column: public star
--    ratings between members are an explicit non-goal, and the
--    cheapest way to keep them out is to leave nowhere to put them.
-- ------------------------------------------------------------
create table if not exists public.ride_feedback (
  id                uuid primary key default gen_random_uuid(),
  ride_id           uuid not null references public.team_rides(id) on delete cascade,
  user_strava_id    text not null references public.users(strava_id) on delete cascade,
  note              text not null check (length(trim(note)) > 0),
  created_at        timestamptz not null default now(),
  unique (ride_id, user_strava_id)
);

create index if not exists idx_ride_feedback_ride
  on public.ride_feedback(ride_id, created_at desc);

comment on table public.ride_feedback is
  'Private post-ride note, visible to admins only. Never exposed to other riders.';

-- ------------------------------------------------------------
-- 4. RLS. Same posture as lesson_purchase_items: nothing is
--    reachable with the anon or authenticated key. Every read
--    and write goes through a route handler on the service role,
--    which is where the champ-role check lives.
--
--    This matters most for ride_feedback: with no anon/auth
--    grant, "private to admin" is enforced by Postgres, not by
--    remembering to filter in a query.
-- ------------------------------------------------------------
alter table public.team_rides    enable row level security;
alter table public.ride_checkins enable row level security;
alter table public.ride_feedback enable row level security;

revoke all on public.team_rides    from anon, authenticated;
revoke all on public.ride_checkins from anon, authenticated;
revoke all on public.ride_feedback from anon, authenticated;

grant select, insert, update, delete on public.team_rides    to service_role;
grant select, insert, update, delete on public.ride_checkins to service_role;
grant select, insert, update, delete on public.ride_feedback to service_role;

-- ------------------------------------------------------------
-- 5. NOT IN THIS MIGRATION — open items, on the record.
--
--  (a) capacity is a column, not a constraint. Enforcing it needs
--      either a trigger or a count-then-insert in a transaction.
--      Left out until you confirm rides are ever actually capped;
--      nullable capacity means "uncapped" today.
--
--  (b) There is no self-serve signup in the app (see notes) —
--      no supabase.auth.signUp call exists anywhere. Until one
--      ships, no new champ can create an account, and these
--      tables stay empty for everyone but existing users.
--
--  (c) users.strava_id is overloaded: it holds a real Strava
--      athlete ID for OAuth users, and the Supabase auth UUID for
--      email users (app/api/auth/email-session/route.ts:26).
--      These FKs inherit that quirk. It works, but it is why a
--      champ does not need a Strava account to check in.
--
--  (d) Attendance now exists in two places — ride_checkins here,
--      and champion_sessions for Strava-backed zone rides that
--      feed reward eligibility. If they should be one thing, the
--      cheaper move is adding team_ride_id to champion_sessions
--      instead of this table. Flagged before it becomes two
--      sources of truth for "did they show up".
-- ------------------------------------------------------------
