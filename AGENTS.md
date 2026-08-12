<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpinTribe — agent context

SpinTribe is a South African cycling community with two deliberately separate pillars: **Team Vitality** (free community membership, scheduled rides and participation) and **coaching** (paid lessons). Coaching may be an upsell from the community, but purchasing coaching is never a prerequisite for Team Vitality.

## Stack & deployment

- Next.js 16 App Router + React 19; client pages under `app/*/page.tsx`; API handlers under `app/api/**/route.ts`.
- State: Zustand persisted to localStorage. It contains the signed-in user's own data; never use it as a substitute for community data.
- Auth: Supabase Auth email/password plus an iron-session httpOnly cookie (`lib/session.ts`). Strava is optional for free Team Vitality membership and cycling features. `/api/auth/email-session` establishes the server session after email authentication.
- DB: Supabase Postgres (project ref `avsghuwixdxbgacfgwld`, eu-west-1). API routes use `supabaseAdmin()` and therefore bypass RLS; privacy checks must live in query code.
- Payments: PayFast is for paid coaching only. Team Vitality must never depend on PayFast, `lesson_purchases`, `lesson_sessions`, or `lesson_services`.
- Email: Resend is the existing email/reminder infrastructure. Do not add a new messaging provider for Team Vitality.
- **Messaging:** WhatsApp and Meta Cloud API are gone. Do not reference, restore, or rebuild them. Outbound messaging is email via existing Resend infrastructure.
- Deploy: GitHub `ssdidiza/spintribe26` → Vercel project `spintribe26`; production deploys from `master`.

## Data model

- `users` — existing membership/profile model. `role` is `champion | member | admin`. **Do not create a separate `champs` table.** Team Vitality membership is represented by `users.role = 'champion'`.
- `users.auth_user_id` links email-auth accounts to `auth.users`; Strava remains optional.
- `teams` includes the seeded Team Vitality team but supports multiple teams elsewhere in the product.
- `champion_sessions` records completed/linked champion activity; it is not a scheduled ride model.
- **Team Vitality scheduled rides:** `team_rides`, `ride_checkins`, and `ride_feedback` are separate community tables. They must have no foreign keys to `lesson_purchases`, `lesson_sessions`, `lesson_services`, PayFast records, or coaching bookings.
- `team_rides.captain_id` is nullable; captain claim uses an atomic `UPDATE ... WHERE captain_id IS NULL`, so first claim wins and there is one captain per ride.
- `ride_checkins` is unique per `(ride_id, champ_id)`. `ride_feedback` is unique per `(ride_id, champ_id)` and contains only a private note; no star-rating model exists.
- The migration `supabase/team-vitality-rides-migration.sql` is **applied**. `team_rides`, `ride_checkins`, and `ride_feedback` exist in the project; their only foreign keys point at `users` and `team_rides`. Treat the file as a record of what shipped, not as pending work.

## Free Team Vitality access

- A champ can sign up, join rides, captain a ride, check in, and leave private feedback without buying coaching or connecting Strava.
- `/join` is the free champion signup entry point. It uses `CHAMP_INVITE_CODE` and Supabase Auth email/password.
- `/api/auth/validate-invite` must never accept an empty/unconfigured invite code.
- `CHAMP_INVITE_CODE` belongs in deployment environment configuration only; never hardcode the real value.
- `/rides` is the Team Vitality hub. Keep it separate from `/lessons` and the coaching purchase funnel.
- Check-in is available only on the ride day window; reminders, if added, use existing Resend infrastructure.
- Rides are scheduled from the founder console: `/admin` → Rides, backed by `/api/admin/rides` and guarded by `getAdminContext()`. Creating rides is admin-only; claiming captaincy and checking in stay open to any champion.
- `/api/admin/rides` returns participation as counts only. Private feedback notes stay service-role-only and must not be added to that response.
- Client code must not read the clock during render to decide whether a ride is today, has started, or is past. `/rides` is prerendered, so build-time and browser clocks disagree. Use `useClientNow()` (`lib/useClientNow.ts`) or let the server send the verdict, as `/api/admin/rides` does with `isPast`.

## Privacy & consent

Identifiable riders on competitive/community surfaces must respect the existing consent model. Private ride feedback is service-role-only and must never be exposed through a public/client-readable endpoint. Do not introduce public star ratings.

## Hard-won gotchas

1. PostgREST has ambiguous embeds in existing `users ↔ teams` and league relationships; use explicit FK hints where needed.
2. Client community fallbacks must be honest loading/error/empty states, never local-store substitutions.
3. `users.strava_id` is TEXT everywhere; do not numerically coerce it in database joins.
4. Lesson booking overlap is coaching-only. `lesson_sessions_no_active_overlap` applies to `public.lesson_sessions`; Postgres exclusion constraints do not affect the separate `team_rides` table.
5. Free membership is not a purchase. Do not gate Team Vitality by PayFast or lesson records.
6. `users.role = 'champion'` is the single source of truth for champion membership. Do not introduce a second membership system.

## Litmus test

The old coaching C1 test — "does it touch booking, payment, or reminding a client?" — is **not a hard failure for Team Vitality** because Team Vitality is deliberately free and outside the coaching funnel. Apply architectural separation instead: no PayFast/lesson dependency, no new external messaging, free-auth access, and measurable community participation.

Team Vitality is justified as a retention/community layer if it produces participation. Initial kill criteria: fewer than 8 distinct active champs checking into at least one ride per month for two consecutive months; captaincy can be removed if the founder still supplies >70% of captains across six rides; feedback can be removed if it produces fewer than one actionable note per four rides.

## Verification

`npm run lint` and `npm run build` must pass. The Team Vitality ride tables were verified on apply to carry zero FKs into coaching/payment tables; re-check that property for any future migration touching `team_rides`, `ride_checkins`, or `ride_feedback`. For live verification, inspect Supabase API logs and Vercel runtime logs.