# Strava Standard Tier Pilot and Extended Access Plan

Last updated: 2026-06-01

## Why This Exists

Strava's Standard tier gives Spera room to run a real pilot with up to 10 connected athletes before requesting broader access. The point of the 10-person pilot is not just testing; it should produce the proof Strava needs for Extended Access: a narrow use case, controlled data display, low API load, clear consent, deletion controls, and evidence that the product helps athletes and the club without exposing unnecessary Strava data.

## Operating Constraints

- Standard tier pilot size: maximum 10 connected Strava athletes.
- Keep the integration direct: Spera connects to Strava through our own app, not through an intermediary API platform.
- Use Strava data only for the connected athlete's club challenge experience.
- Keep FTP private to the signed-in athlete.
- Keep AI insights disabled unless Strava explicitly approves the use case.
- Do not use deprecated Club Activities, Club Administrators, Club Members, or Segments Explore endpoints.
- Prepare for the 2027 Strava API migration: API base URL moves to `https://www.api-v3.strava.com`, and disconnect should move from OAuth deauthorize to the new revoke endpoint.

## The 10 Pilot Seats

These are operating roles for the first 10 connected athletes. One person can help with more than one responsibility, but each seat should have a named owner before the pilot starts.

| Seat | Pilot Role | App Role | Primary Job | Scaling Contribution | Extended Access Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Product owner | Admin | Own pilot goals, Strava review language, and go/no-go decisions. | Keeps scope tight and prevents feature drift. | Maintains weekly pilot report and final Extended Access narrative. |
| 2 | Technical admin | Admin | Tests auth, sync, disconnect, deletion, error states, and Vercel/Supabase health. | Turns bugs into reproducible issues before wider rollout. | Produces technical evidence: API call patterns, cache behavior, data deletion proof. |
| 3 | Compliance reviewer | Admin or Member | Reviews privacy copy, terms, consent screens, and data display. | Keeps app aligned with Strava privacy/display expectations. | Provides a pre-submission compliance checklist. |
| 4 | Champion lead | Champion | Tests champ check-ins, annual progress, zone ride proof, and duplicate prevention. | Defines the champion operating model for other zones. | Shows that champing is based on user-submitted proof, not scraping club endpoints. |
| 5 | Zone captain A | Champion | Runs one real zone ride flow from invite to check-in. | Creates playbook for new zones. | Captures check-in UX feedback and evidence of real club use. |
| 6 | Zone captain B | Champion | Tests a second zone/region and edge cases around region naming. | Proves the model works outside one local group. | Shows multi-zone readiness without Strava Club APIs. |
| 7 | High-volume rider | Member | Tests large monthly distance, frequent rides, and sync cooldowns. | Finds rate-limit and dashboard performance issues early. | Demonstrates API efficiency under active-user behavior. |
| 8 | Casual rider | Member | Tests low-volume usage, missed weeks, and return after inactivity. | Ensures the app works for ordinary club members, not only power users. | Demonstrates inclusive use across ability levels. |
| 9 | Privacy-sensitive rider | Member | Uses private or limited-visibility activities where possible and checks what appears. | Forces privacy-first defaults before scale. | Documents that private details and raw GPS are not exposed in UI. |
| 10 | New joiner | Member | Tests onboarding from scratch with no coaching. | Measures whether the app can scale without hand-holding. | Provides onboarding friction notes and consent clarity feedback. |

## Pilot Rules for the 10 People

- Every participant must explicitly know this is a Standard tier pilot capped at 10 athletes.
- Every participant must connect their own Strava account only.
- No shared Strava credentials.
- No screenshots of another rider's detailed Strava activity data in public channels.
- Use the in-app disconnect/delete controls during testing at least once with a test account or a willing participant.
- Log feedback in the same format every week: what worked, what confused you, what felt too public, what failed.

## What We Need To Prove Before Extended Access

### Product Proof

- Team Vitality riders understand monthly distance goals without support.
- Champions can log zone ride attendance against real weekend rides.
- Members can see their own progress and rank context without needing raw activity feeds from other riders.
- FTP is useful but optional and private.
- The app is valuable even without Strava Club endpoints.

### Privacy Proof

- Raw Strava activity details are shown only to the owning athlete.
- Raw GPS coordinates are not stored or returned to the browser.
- Leaderboard design avoids exposing detailed activity data for other athletes.
- Disconnect removes cached ride data and champion sessions.
- Terms and privacy pages explain Strava use in plain language.

### API Health Proof

- Activity sync is user-triggered or webhook-aware, not background scraping.
- Sync has cooldowns and cache fallback.
- FTP refresh is explicit and cached.
- The app handles Strava 429/rate-limit responses by showing cached data.
- No AI endpoint sends Strava activity data to an LLM.

### Operational Proof

- There is an owner for support, compliance, and technical incidents.
- There is a clear process for deleting user data.
- Pilot feedback is tracked weekly.
- The app has a written scaling plan for 10 -> 50 -> 250 athletes.

## Extended Access From Day One

### Week 0: Before Inviting Pilot Users

- Name the 10 pilot users and assign them to the seats above.
- Confirm Strava API dashboard shows Standard tier.
- Confirm the app uses only required scopes: `read`, `profile:read_all`, and `activity:read` unless private activity support is explicitly justified.
- Confirm AI insights remain disabled.
- Confirm privacy, terms, cookies, and health disclaimer pages are reachable.
- Confirm disconnect/delete controls work.
- Add a pilot feedback tracker with columns: date, user seat, issue, severity, screenshot/video, resolution, Extended Access evidence tag.

### Weeks 1-2: Evidence Capture

- Run onboarding tests with the new joiner and casual rider.
- Run sync tests with high-volume and casual riders.
- Run check-in tests with champion lead and both zone captains.
- Record API behavior: approximate sync frequency, 429 handling, cached response behavior, and failure states.
- Collect privacy feedback from the privacy-sensitive rider.

### Weeks 3-4: Extended Access Draft

- Freeze the use case: Team Vitality Cycling Club monthly challenge and champion check-ins.
- Prepare screenshots that show:
  - Connect with Strava
  - Dashboard
  - Own progress
  - Privacy/disconnect controls
  - Champion check-in
  - Powered by Strava attribution
- Prepare a data-flow summary:
  - OAuth
  - monthly activity sync
  - server-side zone detection
  - cached aggregate progress
  - deletion/disconnect path
- Prepare a rate-limit summary from observed pilot behavior.
- Prepare a privacy statement explaining why each Strava scope is needed.

### Extended Access Submission Positioning

Use this core language:

> Spera is a direct Strava integration for Team Vitality Cycling Club riders. It helps authenticated athletes track their own monthly distance goal, understand their own progress, and submit ride-based champion check-ins for club operations. We use Strava activity data only after athlete authorization, cache only what is needed for the monthly challenge, discard raw GPS after broad zone matching, keep FTP private to the athlete, and provide in-app disconnect and deletion controls.

Avoid positioning Spera as:

- A Strava analytics AI product.
- A public Strava leaderboard product.
- A replacement for Strava clubs.
- A scraping or data aggregation platform.
- A tool that displays detailed athlete activity data to other users.

## App Changes To Prioritize Before Scaling Beyond 10

1. Add a pilot access gate so only the named 10 users can connect during Standard tier.
2. Add an admin-visible pilot roster with seat assignment, status, and feedback owner.
3. Add a compliance-friendly leaderboard mode that shows current user's rank and anonymized or consented aggregate comparison.
4. Add telemetry for Strava API calls by endpoint, response status, and cache hit/miss without storing sensitive payloads.
5. Add a data deletion verification log for admin review.
6. Update Strava API base URL and revoke endpoint ahead of the 2027 deadline.

## Decision Gates

| Gate | Question | Pass Signal |
| --- | --- | --- |
| Gate 1 | Can 10 users onboard without manual fixes? | 8 of 10 complete onboarding and first sync successfully. |
| Gate 2 | Is Strava data display conservative? | Privacy reviewer confirms no detailed activity data from rider A is shown to rider B. |
| Gate 3 | Does champion check-in work? | At least two zone captains log valid check-ins tied to Strava rides. |
| Gate 4 | Is API usage healthy? | No uncontrolled polling, no repeated 429s, cache fallback works. |
| Gate 5 | Are deletion controls real? | Disconnect/delete path removes cached ride data in a verified test. |
| Gate 6 | Are we ready to ask for more athletes? | Product owner, technical admin, and compliance reviewer approve the Extended Access packet. |

## Open Risks

- Current leaderboard expectations may conflict with Strava's cross-user activity display restrictions unless redesigned around consented, aggregate, or current-user-only views.
- Standard tier subscription requirements may affect the app owner or pilot operations after Strava's effective dates.
- Extended Access approval may require clearer proof that Team Vitality has authorization to operate the club challenge.
- The app still needs a future Strava API base URL and token revoke update before the June 1, 2027 deadline.
