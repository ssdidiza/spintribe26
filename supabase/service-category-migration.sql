-- ============================================================
-- PROPOSED — NOT YET APPLIED. For review only.
--
-- Service categories: make coaching one service type among
-- several, rather than the implicit identity of every row in
-- lesson_services.
--
-- Extends the existing lesson_* tables (no parallel system),
-- per AGENTS.md "prefer extending an existing flow".
--
-- Run AFTER cart-package-items-migration.sql in:
--   Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (idempotent).
--
-- READ BEFORE RUNNING: this migration is deliberately inert.
-- It adds a column and backfills it; it inserts no rows and
-- changes no behaviour. Section 3 lists what must ship in the
-- same PR before a single 'group_ride' row may be inserted.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The discriminator.
--    Every existing row is 1:1 coaching, so the default plus
--    NOT NULL backfills the whole table correctly in one step.
-- ------------------------------------------------------------
alter table public.lesson_services
  add column if not exists service_category text not null default 'coaching';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_services_service_category_check'
  ) then
    alter table public.lesson_services
      add constraint lesson_services_service_category_check
      check (service_category in ('coaching', 'group_ride'));
  end if;
end $$;

comment on column public.lesson_services.service_category is
  'Which pillar this service belongs to. coaching = 1:1 paid session (the '
  'original product). group_ride = many riders, one slot. Read by /book and '
  '/api/lessons/services to keep the two funnels separate.';

-- Partial index: the public catalogue query filters on
-- (active, service_category) and orders by sort_order.
create index if not exists idx_lesson_services_category_active
  on public.lesson_services(service_category, sort_order, price_cents)
  where active = true;

-- ------------------------------------------------------------
-- 2. Capacity — the minimum needed for 'group_ride' to mean
--    anything. A category label with no behavioural difference
--    is decoration.
--
--    DELETE THIS SECTION if you want the category shipped on
--    its own; section 1 stands alone.
-- ------------------------------------------------------------
alter table public.lesson_services
  add column if not exists capacity int not null default 1 check (capacity > 0);

comment on column public.lesson_services.capacity is
  'Seats per slot. 1 for coaching (enforced by the existing '
  'lesson_sessions_no_active_overlap exclusion constraint). >1 requires that '
  'constraint to be scoped first — see section 3.';

-- ------------------------------------------------------------
-- 3. NOT IN THIS MIGRATION — the three blockers that must be
--    cleared before any 'group_ride' row is inserted.
--    Listed here so the gap is on the record, not discovered
--    in production.
--
--  (a) lesson_sessions_no_active_overlap is a GLOBAL GiST
--      exclusion constraint: no two sessions with status in
--      ('pending_payment','booked') may overlap in time, for
--      anyone. Eight riders on one 07:00 group ride = eight
--      overlapping rows = seven rejected inserts. Scoping it
--      (e.g. excluding group_ride sessions, or adding a
--      resource key) is a destructive change to the constraint
--      that protects every existing coaching booking. It gets
--      its own migration, its own PR, and its own test.
--
--  (b) /api/lessons/services (app/api/lessons/services/route.ts)
--      selects active = true with no category filter, and the
--      lesson_services_read_active RLS policy is likewise
--      category-blind. A group_ride row inserted today appears
--      on the public /book coaching funnel immediately.
--
--  (c) lesson_purchase_items.quantity_remaining drawdown and
--      book_lesson_from_balance assume one seat per booked
--      session. Group-ride drawdown semantics (does a ride cost
--      a credit? per rider?) are undecided.
--
--    Consequently this migration seeds NO group_ride row. The
--    category exists; nothing sells through it yet.
-- ------------------------------------------------------------
