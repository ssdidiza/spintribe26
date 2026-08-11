<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpinTribe — Project Contract

This file is read at the start of every session (Claude Code, Codex). Every
proposed feature, screen, or endpoint is checked against it before being built.
Part 1 is the contract (apply it before writing code); Part 2 is the
operational reference (stack, data model, gotchas).

---

# Part 1 — The contract

## Two pillars

SpinTribe is two connected but independent products. Know which one you are
working on before you write anything.

**Team Vitality — free community.** The club: scheduled rides, captaincy,
attendance check-in, participation, retention. Membership is
`users.role = 'champion'`. Costs nothing, requires no purchase, and requires
no Strava account. This is the original product — it is what the README, the
legal terms, and the Strava Extended Access application describe.

**Coaching — paid.** PayFast, `lesson_*` tables, bookings, Resend
confirmations and reminders. This is the newer pillar.

**The dependency runs one way, at most:**

```
Team Vitality member  →  potential coaching customer     ✅
Coaching purchase     →  Team Vitality membership        ❌ never
```

Locked into the architecture: the Team Vitality tables (`team_rides`,
`ride_checkins`, `ride_feedback`) carry **no foreign key into
`lesson_purchases`, `lesson_sessions`, `lesson_services`, or PayFast**, and
no code path makes club membership conditional on a purchase. A reviewer
should be able to grep for coupling and find none.

## Product philosophy: less bloat, more action and returns

The coaching pillar exists to do three things well: get a client booked, get
them paid, get them reminded. That is its core loop. Everything else is
optional until proven otherwise.

**The cautionary tale is Strava.** Strava has a feature for everything, and
finding the one you actually want requires digging through menus. SpinTribe is
explicitly the opposite bet: fewer screens, fewer settings, obvious next
action, always.

## The litmus test — apply before building anything new

**First decide which pillar the feature belongs to, then apply that pillar's
test.** Criterion 1 below is a monetisation test written for the coaching
funnel. Do not apply it to Team Vitality work — the community pillar is
deliberately free, so "does it serve payment" is not a meaningful question
there, and forcing it produces a false fail.

### Coaching (paid)

Clears if **at least one** holds:

1. It directly serves booking, payment, or reminding a client.
2. Removing it would cost Spera or a client real time or real money.
3. It reduces the number of steps in an existing core flow (fewer taps, fewer
   screens) — never adds a parallel path to the same outcome.

### Team Vitality (free)

Criterion 1 is **not applicable**. The test is:

> **Does this strengthen participation in Team Vitality without creating
> coupling to the coaching system?**

Criteria 2 and 3 still apply. Any coupling to `lesson_*`, PayFast, or a
purchase gate is an automatic **fail**, regardless of participation upside.

If a request doesn't clear its pillar's test, default answer is **no**, or park
it as a note rather than shipping it.

## Non-negotiables

- **One primary action per screen.** If a screen needs two calls to action,
  it's two screens.
- **No setting buried more than one tap deep.** If it needs a sub-menu, either
  it doesn't belong, or it belongs on the main screen.
- **No feature ships without a kill criteria.** One line, written at build
  time: "we remove this if ___." If nobody can write that line, don't build it.
- **Gamification (leaderboards, streaks, social feed) stays lower priority
  than the booking → payment → reminder loop.** These are the features most
  likely to cause Strava-style sprawl — treat any request to add one with
  extra scrutiny against the litmus test above. Note this is about
  *gamification*, not about Team Vitality: the free club is a pillar, not a
  nice-to-have.
- **Prefer extending an existing flow over adding a new one.** E.g. the
  package/cart booking redesign (see `docs/booking-flow-redesign.md`) replaces
  Brevo entirely rather than living alongside it — no dual systems. Likewise
  Team Vitality membership is `users.role = 'champion'`, not a second
  membership table.

## Messaging: Resend email only

**WhatsApp / Meta Cloud API was removed** (`lib/whatsapp.ts` deleted); there is
no SMS or push channel. Do not reference or rebuild it. New notifications
extend the PayFast ITN handler (`app/api/payfast/notify/route.ts`) or the
04:00 SAST digest cron (`/api/lessons/reminders/send`) — no new cron (Vercel
Hobby limits), no new external channel.

## Team Vitality kill criteria (reviewed 2 months after launch)

Components fail independently. **A failing component is removed on its own —
it does not kill the hub.**

- **Hub:** fewer than 8 active champs per month → question the whole hub.
- **Check-in:** ride check-in rate below 30% → scheduled rides may not be
  useful; investigate before extending them.
- **Captaincy:** Spera still personally captains >70% of rides → remove
  captaincy, keep rides.
- **Feedback:** fewer than ~25% of attendees leave useful notes → hide or
  remove the form.

## When proposing new work

State which pillar it belongs to and which litmus-test criterion it satisfies,
in one line, before writing code. If none apply, say so and ask before
proceeding.

---

# Part 2 — Operational reference

SpinTribe (brand mark "spera") serves a South African cycling community. The
Team Vitality pillar is a Strava-linked monthly challenge: riders sync Strava
rides, chase a monthly km target, and compete in **leagues** (individual),
**teams** (group development), and **zones** (geographic). The product is in
beta with ~6 real riders; the immediate goal is Strava API approval to exceed
the 10-athlete cap, so the live site must work end-to-end with real data —
**never mock data on live surfaces**.

## Stack & deployment

- Next.js 16 App Router + React 19, client pages under `app/*/page.tsx` ("use client" + Zustand),
  API route handlers under `app/api/**/route.ts` (Web Request/Response, promised `params`).
- State: Zustand persisted to localStorage (`lib/store.ts`). It holds only the signed-in rider's
  own data. **Never present store contents as community data** — that's how the "you look alone in
  your league" bug happened. Live data or an honest loading/error state.
- Auth: Strava OAuth → iron-session httpOnly cookie (`lib/session.ts`), keyed by Strava athlete id.
  API routes resolve the user via `getEffectiveUserId(await getSession())`. Email/password accounts
  also exist via Supabase Auth (`/api/auth/email-session`, `/api/auth/join`); for those,
  `users.strava_id` holds the Supabase auth UUID rather than an athlete id.
- DB: Supabase Postgres (project ref `avsghuwixdxbgacfgwld`, eu-west-1). API routes use
  `supabaseAdmin()` (service role — **bypasses RLS**, so privacy filters must live in query code).
- Deploy: GitHub `ssdidiza/spintribe26` → Vercel project `spintribe26`. **Production deploys from
  `master`**; every branch push gets a preview deployment. `vercel.json` defines two crons, both
  guarded by `CRON_SECRET`: the monthly league job (`/api/leagues/assign-monthly`) and the daily
  04:00 SAST lesson reminder digest (`/api/lessons/reminders/send`).
- Env (Vercel; there is no `.env.local` in the repo — see `.env.example`):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `NEXTAUTH_SECRET`/`SESSION_SECRET`, `CRON_SECRET`,
  `NEXT_PUBLIC_APP_URL`, `PAYFAST_*`, `RESEND_API_KEY`, `RESEND_FROM`, `LESSON_COACH_EMAIL`,
  `LESSON_COACH_NAME`, `FOUNDER_STRAVA_ID`, `CHAMP_INVITE_CODE`.

## Data model (public schema)

- `users` — PK `strava_id` (TEXT — always `String()` ids). Profile + `role`
  (`'champion' | 'member' | 'admin'`), `tier` (chosen target),
  `current_league_id/name/threshold` (live league), `team_id`, `zone` (free text), `onboarded`,
  `leaderboard_consent`, `rewards_export_consent`, `auth_user_id`, Strava tokens, sync bookkeeping.
- `activities` — synced Strava rides; `user_strava_id`, `distance` (metres), `elevation_gain`,
  `type`, `date`, `start_lat/lng`, `detected_zone_id` (GPS bounding-box match, often NULL).
- `leagues` (5 rows) + `league_memberships` (one row per rider per month, written by the monthly
  cron) + `monthly_league_standings` (frozen month-end ranks, also cron-written).
- `teams` — `created_by` → users; members are `users.team_id` → teams.
- `zones` — custom zones; seed zones live in code (`SEED_ZONES` in `lib/types.ts`).
- Coaching (paid pillar): `lesson_services`, `lesson_purchases`, `lesson_purchase_items`,
  `lesson_sessions`, `lesson_credit_ledger`, `lesson_availability_rules`, `lesson_blackouts`,
  `lesson_reminders`, `lesson_activity_attributions`.
- Team Vitality rides (free pillar, migration **not yet applied**): `team_rides`, `ride_checkins`,
  `ride_feedback` — see `supabase/team-vitality-rides-migration.sql`. No FK into any `lesson_*`
  table, by design.
- Plus: `champion_sessions`, `notifications`, `tier_upgrade_requests`, `feedback_*`.

## League rules (`lib/leagues.ts`)

Five leagues by monthly km band: 200 Club (0–299), 400 (300–499), 600 (500–799), 800 (800–1199),
1000 Club (1200+). A rider's competitive league = `current_league_threshold` (fallback `tier`).
Rankings are computed per league from the current month's activities
(`lib/leaderboard.ts: buildLeaderboardTiers`); cycling types counted: Ride, VirtualRide, EBikeRide,
Velomobile. The cron reassigns leagues from last month's km on the 1st.

## Privacy & consent (do not weaken)

Any surface that lists identifiable riders (leaderboard, league tables, team rosters/member counts,
zone aggregates) must filter `onboarded = true AND leaderboard_consent = true` in the query.
Consent copy ("Show my progress in SpinTribe rankings") covers league, team, and zone boards.
`rewards_export_consent` separately gates admin reward exports. A rider's *own* data (their team,
their rides) is always visible to themselves regardless of consent.

Ride check-in attendance is club-operations data, not a public board: turnout **counts** are
public, but attendee **names** go only to that ride's captain and to admins. `ride_feedback` is
admin-only and is never exposed to other riders, including in list endpoints.

## Hard-won gotchas

1. **PostgREST ambiguous embeds (caused the June 2026 "one rider in the 200 Club" outage).**
   `users ↔ teams` has TWO relationships (`users.team_id` and `teams.created_by`), and
   `league_memberships → leagues` has THREE. Embedded selects must use FK hints:
   `teams!users_team_id_fkey(...)`, `leagues!league_memberships_league_id_fkey(...)`.
   Without the hint Supabase REST answers **HTTP 300**, supabase-js yields `error`, the route 500s,
   and clients silently degraded. Check Supabase API logs (status 300/4xx/5xx) when a list looks
   inexplicably empty — route handlers return error JSON, they don't `console.error`, so Vercel
   runtime logs stay quiet.
2. **Client fallbacks must be honest.** When a community endpoint fails, show
   loading/error/empty states — never substitute the local store (it contains one rider: you).
3. **`users.strava_id` is TEXT** everywhere (sessions, FKs); numeric coercion breaks joins.
4. **Zone attribution**: GPS `detected_zone_id` is sparse. Zone stats fall back to the rider's
   profile `zone` matched by exact zone id/name (NOT region — "Gauteng" spans 4 zones). Unmatched
   rides surface as "zone not detected yet".
5. **Team creation abuse guards** live in `app/api/teams/route.ts` POST: onboarded only, one
   created team per rider, must leave current team first, duplicate name/slug → 409.
6. **`lesson_sessions_no_active_overlap`** is a GLOBAL GiST exclusion constraint on
   `lesson_sessions`: no two sessions with status `pending_payment`/`booked` may overlap in time,
   for anyone. It encodes the single-coach 1:1 assumption. It does **not** apply to `team_rides`
   (different table), which is why group rides can share a slot.

## Verification

`npm run lint` and `npm run build` must pass. For live verification, check the Supabase project's
API logs (REST status codes) and Vercel runtime logs; the preview deployment for a branch runs
against the production database.
