<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpinTribe — agent context

SpinTribe (brand mark "spera") is a Strava-linked monthly cycling challenge for a South African
community. Riders sync Strava rides, chase a monthly km target, and compete in **leagues**
(individual), **teams** (group development), and **zones** (geographic). The product is in beta with
~6 real riders; the immediate goal is Strava API approval to exceed the 10-athlete cap, so the live
site must work end-to-end with real data — **never mock data on live surfaces**.

## Stack & deployment

- Next.js 16 App Router + React 19, client pages under `app/*/page.tsx` ("use client" + Zustand),
  API route handlers under `app/api/**/route.ts` (Web Request/Response, promised `params`).
- State: Zustand persisted to localStorage (`lib/store.ts`). It holds only the signed-in rider's
  own data. **Never present store contents as community data** — that's how the "you look alone in
  your league" bug happened. Live data or an honest loading/error state.
- Auth: Strava OAuth → iron-session httpOnly cookie (`lib/session.ts`), keyed by Strava athlete id.
  API routes resolve the user via `getEffectiveUserId(await getSession())`.
- DB: Supabase Postgres (project ref `avsghuwixdxbgacfgwld`, eu-west-1). API routes use
  `supabaseAdmin()` (service role — **bypasses RLS**, so privacy filters must live in query code).
- Deploy: GitHub `ssdidiza/spintribe26` → Vercel project `spintribe26`. **Production deploys from
  `master`**; every branch push gets a preview deployment. `vercel.json` defines the monthly league
  cron (`/api/leagues/assign-monthly`, GET, guarded by `CRON_SECRET`).
- Env (Vercel; there is no `.env.local` in the repo): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRAVA_CLIENT_ID`,
  `STRAVA_CLIENT_SECRET`, `NEXTAUTH_SECRET`/`SESSION_SECRET`, `CRON_SECRET`.

## Data model (public schema)

- `users` — PK `strava_id` (TEXT — always `String()` ids). Profile + `tier` (chosen target),
  `current_league_id/name/threshold` (live league), `team_id`, `zone` (free text), `onboarded`,
  `leaderboard_consent`, `rewards_export_consent`, Strava tokens, sync bookkeeping.
- `activities` — synced Strava rides; `user_strava_id`, `distance` (metres), `elevation_gain`,
  `type`, `date`, `start_lat/lng`, `detected_zone_id` (GPS bounding-box match, often NULL).
- `leagues` (5 rows) + `league_memberships` (one row per rider per month, written by the monthly
  cron) + `monthly_league_standings` (frozen month-end ranks, also cron-written).
- `teams` — `created_by` → users; members are `users.team_id` → teams.
- `zones` — custom zones; seed zones live in code (`SEED_ZONES` in `lib/types.ts`).
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

## Verification

`npm run lint` and `npm run build` must pass. For live verification, check the Supabase project's
API logs (REST status codes) and Vercel runtime logs; the preview deployment for a branch runs
against the production database.
