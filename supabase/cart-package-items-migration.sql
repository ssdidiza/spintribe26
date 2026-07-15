-- ============================================================
-- Cart + package drawdown: line items on purchases, a guest
-- schedule token, and an atomic book-from-balance function.
-- Extends the existing lesson_* tables (no parallel system).
-- Run AFTER lesson-public-booking-migration.sql in:
--   Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Line items: "5 x Skills ride + 1 x Intro" on one purchase,
--    with a live remaining balance drawn down per booked session.
-- ------------------------------------------------------------
create table if not exists public.lesson_purchase_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_id         uuid not null references public.lesson_purchases(id) on delete cascade,
  service_id          uuid references public.lesson_services(id) on delete set null,
  item_name           text not null,
  duration_minutes    int not null default 60 check (duration_minutes > 0),
  unit_price_cents    int not null check (unit_price_cents >= 0),
  quantity            int not null check (quantity > 0),
  quantity_remaining  int not null check (quantity_remaining >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (quantity_remaining <= quantity)
);

create index if not exists idx_lesson_purchase_items_purchase
  on public.lesson_purchase_items(purchase_id);

create index if not exists idx_lesson_purchase_items_service
  on public.lesson_purchase_items(service_id)
  where service_id is not null;

alter table public.lesson_purchase_items enable row level security;
revoke all on public.lesson_purchase_items from anon, authenticated;
grant select, insert, update, delete on public.lesson_purchase_items to service_role;

-- ------------------------------------------------------------
-- 2. Guest scheduling: an unguessable token on the purchase is
--    the only credential needed to reach /schedule (no account).
-- ------------------------------------------------------------
-- Two random UUIDv4s stripped of dashes = 64 hex chars (~250 bits of entropy),
-- using only the pg13+ builtin — no dependency on where pgcrypto is installed.
alter table public.lesson_purchases add column if not exists schedule_token text;

update public.lesson_purchases
set schedule_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
where schedule_token is null;

alter table public.lesson_purchases alter column schedule_token
  set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

alter table public.lesson_purchases alter column schedule_token set not null;

create unique index if not exists idx_lesson_purchases_schedule_token
  on public.lesson_purchases(schedule_token);

-- A cart purchase carries multiple line items and is scheduled after payment
-- (unlike 'direct', which locks one slot before checkout).
alter table public.lesson_purchases drop constraint if exists lesson_purchases_kind_check;
alter table public.lesson_purchases
  add constraint lesson_purchases_kind_check check (kind in ('package', 'direct', 'cart'));

-- ------------------------------------------------------------
-- 3. Sessions know which line item they consumed, so cancelling
--    a session can restore the balance.
-- ------------------------------------------------------------
alter table public.lesson_sessions add column if not exists purchase_item_id
  uuid references public.lesson_purchase_items(id) on delete set null;

create index if not exists idx_lesson_sessions_purchase_item
  on public.lesson_sessions(purchase_item_id)
  where purchase_item_id is not null;

-- ------------------------------------------------------------
-- 4. Atomic drawdown booking. Locks the item row, checks the
--    balance, decrements, and inserts the session in one txn.
--    The lesson_sessions_no_active_overlap exclusion constraint
--    rejects clashing slots and rolls the whole thing back.
-- ------------------------------------------------------------
create or replace function public.book_package_session(
  p_item_id uuid,
  p_starts_at timestamptz,
  p_location text default null,
  p_client_notes text default null
) returns public.lesson_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.lesson_purchase_items%rowtype;
  v_purchase public.lesson_purchases%rowtype;
  v_session public.lesson_sessions%rowtype;
begin
  select * into v_item
  from public.lesson_purchase_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'purchase item not found' using errcode = 'P0002';
  end if;
  if v_item.quantity_remaining <= 0 then
    raise exception 'no sessions remaining on this item' using errcode = 'P0001';
  end if;

  select * into v_purchase
  from public.lesson_purchases
  where id = v_item.purchase_id;

  if v_purchase.status <> 'paid' then
    raise exception 'purchase is not paid' using errcode = 'P0001';
  end if;

  update public.lesson_purchase_items
  set quantity_remaining = quantity_remaining - 1,
      updated_at = now()
  where id = v_item.id;

  insert into public.lesson_sessions (
    purchase_id, purchase_item_id, user_strava_id, service_id,
    status, starts_at, ends_at, duration_minutes, credit_amount,
    location, customer_name, customer_email, customer_phone, client_notes
  ) values (
    v_purchase.id, v_item.id, v_purchase.user_strava_id, v_item.service_id,
    'booked', p_starts_at,
    p_starts_at + make_interval(mins => v_item.duration_minutes),
    v_item.duration_minutes, 1,
    coalesce(p_location, v_purchase.booking_location, ''),
    v_purchase.customer_name, v_purchase.customer_email, v_purchase.customer_phone,
    coalesce(p_client_notes, '')
  )
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.book_package_session(uuid, timestamptz, text, text) from anon, authenticated, public;
grant execute on function public.book_package_session(uuid, timestamptz, text, text) to service_role;

-- ------------------------------------------------------------
-- 5. Cancelling a drawdown session restores the balance
--    automatically, whichever route performs the cancel.
-- ------------------------------------------------------------
create or replace function public.restore_package_balance_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purchase_item_id is not null
     -- Pending-payment holds have not consumed a paid entitlement yet. If one
     -- expires and PayFast confirms late, activation rebooks that same session;
     -- restoring here would grant an extra session.
     and old.status = 'booked'
     and new.status in ('cancelled', 'coach_cancelled') then
    update public.lesson_purchase_items
    set quantity_remaining = least(quantity, quantity_remaining + 1),
        updated_at = now()
    where id = new.purchase_item_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.restore_package_balance_on_cancel() from anon, authenticated, public;
grant execute on function public.restore_package_balance_on_cancel() to service_role;

drop trigger if exists trg_restore_package_balance on public.lesson_sessions;
create trigger trg_restore_package_balance
  after update of status on public.lesson_sessions
  for each row execute function public.restore_package_balance_on_cancel();

-- ------------------------------------------------------------
-- 6. Backfill: give existing multi-session Performance Blocks
--    an item for the full block, minus sessions already booked.
--    Plain single-session purchases intentionally remain on the
--    slot-first flow and do not gain a drawdown balance.
--    Idempotent: only fills purchases that have no items yet.
-- ------------------------------------------------------------
insert into public.lesson_purchase_items
  (purchase_id, service_id, item_name, duration_minutes, unit_price_cents, quantity, quantity_remaining)
select
  p.id,
  p.service_id,
  coalesce(nullif(p.description, ''), 'Cycling session'),
  coalesce(p.booking_duration_minutes, 60),
  p.unit_price_cents,
  greatest(1, coalesce((p.payfast_metadata ->> 'packageSessions')::int, round(p.lesson_count)::int, 1)),
  greatest(0,
    greatest(1, coalesce((p.payfast_metadata ->> 'packageSessions')::int, round(p.lesson_count)::int, 1))
    - (
        select count(*)::int from public.lesson_sessions s
        where s.purchase_id = p.id
          and s.status in ('pending_payment', 'booked', 'completed', 'no_show')
      )
  )
from public.lesson_purchases p
where p.kind = 'direct'
  and p.status in ('paid', 'pending_payment')
  and greatest(1, coalesce((p.payfast_metadata ->> 'packageSessions')::int, round(p.lesson_count)::int, 1)) > 1
  and not exists (
    select 1 from public.lesson_purchase_items i where i.purchase_id = p.id
  );

-- Link each backfilled purchase's existing sessions to its item so a later
-- cancellation restores the balance.
update public.lesson_sessions s
set purchase_item_id = i.id
from public.lesson_purchase_items i
where s.purchase_id = i.purchase_id
  and s.purchase_item_id is null;
