# SpinTribe Booking Flow Redesign — Cart & Package Model

**Status:** In PR #24 (July 2026); migration and production deployment pending — implemented as an extension of the existing `lesson_*` tables, not the greenfield schema below
**Owner:** Spera Didiza
**Context:** Replacing Brevo Meetings as the booking system for SpinTribe

## Implementation decision (2026-07-14)

The schema below was designed before auditing what `/book` already shipped. The
existing system already had most of this model under different names:

| This doc proposed      | Already existed as                                    |
| ---------------------- | ----------------------------------------------------- |
| `session_types`        | `lesson_services`                                     |
| `clients`              | guest fields on `lesson_purchases` (name/email/optional phone) |
| `client_packages`      | `lesson_purchases` (PayFast reference, Xero fields)   |
| `client_package_items` | **missing** → added as `lesson_purchase_items`        |
| `bookings`             | `lesson_sessions` (incl. anti-overlap constraint)     |
| `invoices`             | Xero/Resend fields on `lesson_purchases`              |

Building the greenfield schema would have created a second booking system next
to the live one — exactly what AGENTS.md forbids. So the implementation
(`supabase/cart-package-items-migration.sql`) adds only what was missing:

- `lesson_purchase_items` — line items with `quantity` / `quantity_remaining`
- `schedule_token` on `lesson_purchases` — unguessable link for guest scheduling
- `book_package_session()` — atomic drawdown (decrement + insert in one txn)
- a trigger restoring the balance when a drawdown session is cancelled
- a backfill giving existing multi-session Performance Blocks their item rows
  (this also fixed already-sold Performance Blocks, whose remaining sessions
  previously existed only inside `payfast_metadata` with no way to book them)

The flow sections below still describe the product behaviour accurately; read
the table names through the mapping above.

## Problem

Brevo Meetings treats every appointment as a fully independent transaction — its own
booking flow, confirmation, calendar hold, and price line. There is no concept of a
package or bundle.

**Real example that triggered this redesign:** On 13 July 2026, client Tanya Ortlepp
wanted 6 sessions (5x "2-Hour Lesson: Progress Ride" @ R798 + 1x "3-Hour Lesson:
Comprehensive Coaching" @ R1,197 = R5,187 total). Because Brevo has no bundle
support, she had to run the entire booking flow 6 separate times in a 4-minute
window, producing 6 disconnected confirmation emails that then had to be manually
reconciled into a single invoice.

This does not scale. Every multi-session client currently costs manual admin time
proportional to session count.

## Goal

Decouple **payment** from **scheduling**. A client pays once for a bundle of
sessions (a "cart"), then draws down against that bundle to pick individual times.
One purchase = one invoice, regardless of how many sessions are inside it.

## Data model (Supabase / Postgres)

```sql
-- Bookable session types (Progress Ride, Comprehensive Coaching, etc.)
create table session_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- e.g. "Progress Ride"
  duration_minutes int not null,    -- e.g. 120
  price_zar numeric(10,2) not null, -- e.g. 798.00
  description text,
  active boolean default true
);

-- Clients
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,                       -- optional contact number
  created_at timestamptz default now()
);

-- A single purchase event — can contain one or many sessions of mixed types
create table client_packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  payfast_payment_id text,
  total_amount_zar numeric(10,2) not null,
  status text not null default 'pending', -- pending | paid | cancelled
  created_at timestamptz default now(),
  expires_at timestamptz            -- optional validity window
);

-- Line items within a purchase (the "cart" contents)
create table client_package_items (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid references client_packages(id) not null,
  session_type_id uuid references session_types(id) not null,
  quantity_purchased int not null,
  quantity_remaining int not null   -- decremented as sessions get scheduled
);

-- Actual scheduled sessions, drawn down from a client_package_item
create table bookings (
  id uuid primary key default gen_random_uuid(),
  client_package_item_id uuid references client_package_items(id) not null,
  client_id uuid references clients(id) not null,
  scheduled_at timestamptz not null,
  duration_minutes int not null,
  status text not null default 'confirmed', -- confirmed | cancelled | completed
  calendar_event_id text,
  confirmation_email_sent boolean default false,
  day_of_email_sent boolean default false,
  created_at timestamptz default now()
);

-- One invoice per purchase, never per session
create table invoices (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid references client_packages(id) not null,
  amount_zar numeric(10,2) not null,
  status text not null default 'issued', -- issued | paid
  resend_email_id text,
  xero_invoice_id text,
  created_at timestamptz default now()
);
```

## Flow

### 1. Cart checkout — `/book`
Client adds one or more session types + quantities to a cart (e.g. 5x Progress
Ride + 1x Comprehensive Coaching). One PayFast checkout for the combined total.

### 2. Purchase creation + PayFast ITN webhook
Before redirecting to PayFast, create one `lesson_purchases` row, its
`lesson_purchase_items` rows, and one Xero invoice with a line per cart item.
On payment confirmation:
- Mark the purchase paid (the item balances already exist)
- Record the PayFast payment against the Xero invoice when Xero is configured
- Send one receipt email via Resend with the personal `/schedule` link

### 3. Scheduling — `/schedule?package_id=...`
Client places each purchased session onto an open slot:
- Decrements `quantity_remaining` on the relevant `client_package_items` row
- Creates one `bookings` row + one calendar event per session (sessions land on
  different days, so calendar entries stay separate — but all are traceable back
  to the same `client_package_id`)
- No new payment, no new invoice triggered

### 4. Daily digest (existing Vercel cron, 4am SAST)
Pulls today's `bookings` and sends a short day-of email through the existing
Resend integration. Calendar invites carry one-day and two-hour alerts.

## Why this fixes the Tanya case specifically

- **Invoicing** happens exactly once, at cart checkout — never accumulates as
  separate emails to reconcile by hand.
- **Booking friction** drops from N repeated flows to 1 cart + N slot picks.
- **Calendar** stays one-event-per-session (correct), but all events are
  queryable as a group via `client_package_id`.

## Migration notes

- Keep the existing Brevo link live but stop sending it to new clients once
  `/book` supports carts. Test end-to-end with one real client first.
- Existing in-flight Brevo bookings (e.g. Tanya's remaining scheduled sessions)
  should be backfilled into a `client_packages` + `client_package_items` row
  manually so they appear correctly in the dashboard — no need to re-book them.

## Open items for implementation (Claude Code / Codex)

- [x] Build `/book` cart UI (session type + quantity picker, running total)
- [x] PayFast checkout integration for variable/combined cart totals
- [x] ITN webhook handler → package/invoice creation + Resend email
- [x] `/schedule` slot picker UI, wired to `quantity_remaining` balances
- [x] Calendar event creation on booking (reuse existing `.ics` endpoint logic)
- [x] Admin view: client packages, remaining balances, upcoming bookings
- [ ] Run `supabase/cart-package-items-migration.sql` in the Supabase SQL editor
- [ ] Backfill Tanya's existing Brevo bookings: insert one paid
      `lesson_purchases` row + `lesson_purchase_items` rows (5x Progress Ride,
      1x Comprehensive Coaching, `quantity_remaining` = what's still unbooked),
      then send her the `/schedule?token=…` link from the admin packages view
- [ ] Test end-to-end with one real client, then stop sending the Brevo link

**Kill criteria:** revert the cart UI to single-session-only if fewer than two
multi-session checkouts happen in 3 months. The drawdown machinery stays either
way — it services already-sold Performance Blocks.
