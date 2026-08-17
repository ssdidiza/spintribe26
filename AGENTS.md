<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpinTribe — agent context

SpinTribe is a South African cycling product with two deliberately separate rails: **free club/community participation** and **paid coaching**. Team Vitality is the first configured club, not SpinTribe's own brand. Team Vitality is operated by Discovery Limited and its official membership, rewards, eligibility and decisions remain governed by Discovery. SpinTribe may coordinate community rides and participation but must never imply that it is Discovery's official app or endorsed by Discovery.

## Stack & deployment

- Next.js 16 App Router + React 19; client pages under `app/*/page.tsx`; API handlers under `app/api/**/route.ts`.
- State: Zustand persisted to localStorage. It contains the signed-in user's own state; never use it as a substitute for server-authoritative community data.
- Auth: Supabase Auth email/password plus an iron-session httpOnly cookie (`lib/session.ts`). Strava is optional for free club membership and ride participation. `/api/auth/email-session` establishes the server session after email authentication.
- DB: Supabase Postgres (project ref `avsghuwixdxbgacfgwld`, eu-west-1). API routes use `supabaseAdmin()` and therefore bypass RLS; authorization/privacy checks must live in server query code.
- Payments: PayFast is for paid coaching only. Club membership and rides must never depend on PayFast, `lesson_purchases`, `lesson_sessions`, or `lesson_services`.
- Email: Resend is the only outbound messaging provider. Do not introduce another provider for club/community work.
- WhatsApp and Meta Cloud API are gone. Do not reference, restore or rebuild them.
- Deploy: GitHub `ssdidiza/spintribe26` → Vercel project `spintribe26`; production deploys from `master`.

## Public coaching booking is independent

Public lesson booking already supports guest/non-member customers through `lesson_services`, `lesson-public-booking-migration.sql`, and the existing PayFast checkout flow. Do not rebuild or gate it behind club membership. Changes to club/rides must be regression-tested against public booking and otherwise leave the coaching rail alone.

## Canonical club membership model

- `users` is the person/profile table. `users.role` is **platform-wide only**: persisted values are `member` or `admin`. Do not persist `champion` into `users.role`.
- The TypeScript/UI value `role = 'champion'` may still appear as a **derived client capability** for compatibility with existing champion screens. Server authorization must never trust that local value.
- `team_memberships` is the **single source of truth for club membership and club role**. It links `user_strava_id → users.strava_id` to `team_id → teams.id`, with `role = member | champion` and `is_primary`.
- A person may belong to multiple clubs and may champion more than one club. Adding a new club requires inserting a row into `teams`; no new club-specific schema is allowed.
- `users.team_id` is retained only as a compatibility mirror of the one `team_memberships.is_primary = true` membership used for existing leaderboard attribution. It is not an authorization source and must stay synchronized by team join/leave/create server code until legacy leaderboard code no longer needs it.
- Do not create a separate `champs` table or any second club-membership system.
- `teams` contains the seeded Team Vitality row and is the generic club/team catalogue.

## Club authorization

- Use `lib/club-auth.ts` to resolve the signed-in canonical profile and memberships.
- A club champion is a `team_memberships` row with `role = 'champion'` for that exact `team_id`.
- Platform `admin` is a global override for founder/admin operations.
- Never authorize a club action from `users.role`, `users.team_id`, a Zustand role, or a route parameter alone.
- `/join` remains the Team Vitality champion signup entry point today. It creates a normal platform member plus a Team Vitality `team_memberships.role = 'champion'` record; it does not create a global champion role.
- `/api/auth/validate-invite` must never accept an empty/unconfigured invite code. `CHAMP_INVITE_CODE` stays in deployment environment configuration only.
- Strava onboarding's Champion choice is likewise translated into Team Vitality membership, while the persisted platform role stays `member` unless the user is `admin`.

## Founder email/Strava identity

- The founder's canonical profile is the real Strava-keyed `users` row (`26187606` by default), not a synthetic row keyed by the Supabase auth UUID.
- `users.auth_user_id` must link the founder's Supabase email-auth account to that canonical profile.
- `/api/auth/email-session` is responsible for repairing a missing founder link from the configured founder email allowlist before any synthetic email profile can win resolution.
- `lib/admin-auth.ts` must resolve email auth through `auth_user_id` and hand admin routes the canonical `users.strava_id`.
- A change affecting this path is incomplete until verified with a real Supabase-authenticated founder session, not only lint/build.

## Scheduled club rides

- `team_rides`, `ride_checkins`, and `ride_feedback` are the free community ride rail. They carry zero foreign keys or dependencies into coaching/payment tables.
- Every `team_rides` row has a non-null `team_id`; rides are always scoped to one club.
- Ride fields include `starts_at`, `meeting_point`, short `route`/pace text, `capacity`, nullable `captain_id`, and `created_by`.
- Any signed-in champion of the ride's club may view and participate in that club's rides.
- A champion may create a future-dated ride only for a club they champion. Creation makes the creator captain immediately (`captain_id = created_by`). No approval step is required.
- Champion-created ride abuse guards: maximum capacity **100** and maximum **5 newly created rides per rolling 7 days per champion**. These values are deliberate: 100 is well above a normal local group ride without making unbounded attendance possible; 5/week permits frequent community activity while limiting spam.
- Founder/admin may create a ride directly for any club through the founder console and may remove any ride regardless of creator or attendance. This is the moderation/official SpinTribe-run path (for example a SpinTribe-organised Ferndale ride offered to Team Vitality members).
- A champion may cancel only a ride they created and only while it has zero check-ins.
- `team_rides.captain_id` remains nullable for admin-created/open rides. Captain claim preserves the concurrency invariant: one atomic `UPDATE ... WHERE captain_id IS NULL`; never replace it with read-then-write logic.
- `ride_checkins` stays unique per `(ride_id, champ_id)` and check-in remains server-enforced within **±12 hours of `starts_at`**. Capacity is enforced server-side.
- `ride_feedback` stays unique per `(ride_id, champ_id)`. Feedback opens after ride start, contains only a private note, and must remain service-role-only. Do not expose notes through public/client-readable responses or add public star ratings.
- `/api/admin/rides` may return participation counts, never feedback note contents.
- Browser tables are RLS-closed to `anon`/`authenticated`; server routes use `supabaseAdmin()`.
- Client code must not read the clock during prerender to decide ride state. Use `useClientNow()` (`lib/useClientNow.ts`) for browser transitions or return the verdict from the server.

## Legal and brand boundary

The Discovery/Team Vitality disclaimer language in `app/legal/terms/page.tsx` and `app/legal/privacy/page.tsx` is load-bearing. Do not weaken, remove, contradict, or replace it with wording that implies endorsement, official-app status, official reward authority, or official club administration by SpinTribe/spera. New club UI should use generic operator language where possible and add a Discovery-specific reminder where Team Vitality is named.

## Privacy & consent

Identifiable riders on competitive/community surfaces must respect the existing consent model. Private ride feedback is service-role-only. Do not substitute local Zustand data for server community records. `users.strava_id` is TEXT everywhere; do not numerically coerce it in database joins.

## Hard-won gotchas

1. PostgREST has ambiguous embeds in existing `users ↔ teams` and league relationships; use explicit FK hints where needed.
2. Free club membership is not a purchase. Never gate it or rides with PayFast or `lesson_*` records.
3. `team_memberships` is the membership/club-role authority; `users.team_id` is only the temporary primary-team leaderboard mirror.
4. The client `UserRole = 'champion'` is derived UI compatibility, not a persisted database role and not an authorization source.
5. Lesson booking overlap is coaching-only. `lesson_sessions_no_active_overlap` applies to `public.lesson_sessions`; it does not apply to `team_rides`.
6. A `datetime-local` value is zoneless. Convert it to an instant in the browser before POSTing; do not parse a Johannesburg local clock string as UTC on the server.
7. Founder email sign-in must land on the founder's real Strava-keyed admin row via `auth_user_id`; do not create a second admin identity.

## Kill criteria

Community rides are judged **per club**, not globally. Team Vitality remains subject to the original experiment thresholds:

- participation kill criterion: fewer than **8 distinct active champs** checking into at least one ride in a month for two consecutive months;
- founder-dependence criterion: founder/admin supplies **more than 70% of captains across six rides**;
- feedback floor: fewer than **1 actionable note per 4 rides**.

Do not delete or quietly relax these criteria when adding clubs. Apply the same framework per club unless a documented experiment explicitly supersedes it.

## Migrations and verification

- `supabase/team-vitality-rides-migration.sql` records the original applied single-club ride tables.
- `supabase/multi-club-rides-migration.sql` is the idempotent migration that introduces canonical `team_memberships`, scopes rides to `team_id`, adds `meeting_point`/`created_by`, backfills Team Vitality, and normalizes legacy `users.role = 'champion'` rows to platform `member` after membership backfill.
- Any future ride/club migration must remain idempotent, browser-RLS-closed, and contain zero foreign keys into coaching/payment tables.
- `npm run lint` and `npm run build` must pass before merge.
- Verify public guest lesson booking still works after club changes without rebuilding it.
- Verify a real founder email-auth session resolves to the canonical admin profile and can reach an admin endpoint.
- Re-check ride/club foreign keys after migration.
- For live verification, inspect Supabase state/API logs and Vercel deployment/runtime logs.
