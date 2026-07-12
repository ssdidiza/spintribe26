# SpinTribe Coaching Booking Flow

## Page Structure

1. Header: SpinTribe Coaching
2. Intro copy: One-on-one cycling coaching in Johannesburg. Start with a single session or commit to a Performance Block.
3. Optional account note: Strava sign-in only links the lesson to the rider's own SpinTribe history. Booking, payment, calendar invites, and reminders use typed form data.
4. Session/package selection:
   - Single sessions remain the entry funnel.
   - Performance Blocks are shown as the next step for structured progression.
5. Time slot selection.
6. Rider details: name, email, WhatsApp, preferred meeting point, goals.
7. PayFast checkout.
8. Confirmation: booking details, add-to-calendar, Performance Block add-on, optional SpinTribe account link.

## Pricing

| Offer | Duration | Price | Compare-at | Saving | Positioning |
| --- | ---: | ---: | ---: | ---: | --- |
| Intro Cycling Session | 60 min | R399 | - | - | Low-friction first coaching session. |
| Skills & Training Ride | 90 min | R549 | - | - | Technique, pacing, and endurance on a guided ride. |
| Performance Block (4 sessions) | 4 x 90 min | R1,899 | R2,196 | R297 / 13.5% | FTP-based structured progression after the first ride. |
| Performance Block (8 sessions) | 8 x 90 min | R3,499 | R4,392 | R893 / 20.3% | Goal-tied block for event prep, FTP improvement, or return-to-form. |

## Confirmation Email

Subject: `Your SpinTribe Coaching session is confirmed - {{when}}`

Body:

```text
Hi {{first_name}},

Your {{service_name}} with SpinTribe Coaching is confirmed.

When: {{date_time_sast}}
Where: {{meeting_point}}

The calendar invite is attached. You can also add it from the confirmation screen.

Keep the progression going:
After one session, the best next step is a structured Performance Block: four FTP-based sessions with a plan, follow-up, and a lower per-session rate.

Add the 4-session Performance Block and save {{saving_amount}} versus booking four Skills & Training Rides one at a time:
{{add_block_url}}

Already use SpinTribe? Sign in with Strava from the confirmation screen if you want this lesson linked to your own SpinTribe history. Booking and reminders do not pull Strava metrics.
```

Do not publish an "FTP X% faster" claim until SpinTribe has a measured coaching cohort. Use `{{ftp_progress_claim}}` as a placeholder only if a verified number is available.

## WhatsApp Messages

**Status: implemented** — provider is the **Meta WhatsApp Cloud API** (plain `fetch`, no SDK,
mirroring the Resend email integration). Two messages (the earlier 24h/1h reminder design was
replaced 2026-07-12 to fit Vercel Hobby's daily-cron limit — no external scheduler needed):

Instant booking confirmation (sent the moment PayFast confirms, alongside the email):

```text
Hi {{first_name}}, your SpinTribe Coaching {{service_name}} is confirmed for {{when_sast}}.

Meet: {{meeting_point}}
Your calendar invite is in your email. Reply here if anything changes.
```

Daily digest (04:00 SAST cron, one message per rider with a session that calendar day):

```text
Hi {{first_name}}, you've got a SpinTribe session today at {{time_sast}} with {{coach_name}}.

Meet: {{meeting_point}}
Reply here if anything changes.
```

## Technical Notes

- PayFast remains the only payment integration for this flow. The booking page posts to `app/api/lessons/book/route.ts`, which creates a `lesson_purchases` row and redirects to PayFast.
- PayFast ITN confirmation lands in `app/api/payfast/notify/route.ts`. After `activateDirectLessonBooking`, it calls `dispatchLessonBookingNotifications` in `lib/notify.ts`.
- ICS generation already lives in `lib/ics.ts`. Confirmation emails attach the generated ICS in `lib/notify.ts`, and the confirmation screen now exposes a calendar download through `app/api/lessons/book/calendar/route.ts`.
- The instant WhatsApp confirmation hooks immediately after PayFast confirmation, in the same notification dispatch path: `dispatchLessonBookingNotifications` (`lib/notify.ts`) calls `sendLessonWhatsAppConfirmation` (`lib/lesson-reminders.ts`) whenever `customer_phone` is present. It sends synchronously (never waits for a cron), best-effort, and logs/dedupes via a `lesson_reminders` row (`kind='confirmation'`) so PayFast ITN retries can't double-send.
- The cron route `/api/lessons/reminders/send` (GET, `CRON_SECRET`-guarded, scheduled daily at 02:00 UTC / 04:00 SAST in `vercel.json`) sends the daily digest: every `booked` session starting later that SAST calendar day gets one message, deduped per session via `kind='daily_digest'`. Payloads carry only rider-typed booking fields: name, phone, service, time, meeting point.
- **PayFast ITN signature gotcha (root cause of the 2026-07-12 stuck-confirmation bug):** the checkout signature excludes blank fields, but the ITN signature covers EVERY posted field in received order, empties included, values encoded verbatim. `lib/payfast.ts` has separate builders (`buildPayFastParamString` for checkout, `buildPayFastItnParamString` for ITN verify + server validation). Reusing the checkout builder for ITN makes every real ITN 401 and bookings never confirm.
- The coaching flow must not fetch or display Strava metrics. Optional Strava sign-in should only link the lesson to the rider's own SpinTribe account/history.

## WhatsApp implementation

Implemented with the **Meta WhatsApp Cloud API** (`lib/whatsapp.ts` — plain `fetch` against
`graph.facebook.com`, no SDK dependency). Chosen over Twilio because there is no per-message
middleman markup and the integration style matches the existing Resend email path: best-effort,
env-driven, dormant until credentials are set.

Design (since 2026-07-12): **instant confirmation + daily digest**. The original precise
24h/1h reminder queue was replaced because Vercel Hobby only allows daily crons; the digest
fits that limit with no external scheduler (cron-job.org is NOT needed).

### Moving parts

- `supabase/lesson-reminders-migration.sql` — the `lesson_reminders` message log
  (`session_id, channel, kind, scheduled_for, status, payload, attempts, provider_message_id,
  sent_at, error`), unique per `(session_id, channel, kind)`. That unique key is the dedupe
  guard: ITN retries can't double-send the confirmation, cron re-runs can't double-send the
  digest. ✅ Applied to production (incl. the `kind` upgrade to
  `confirmation`/`daily_digest`).
- `lib/lesson-reminders.ts` — `sendLessonWhatsAppConfirmation` (instant, called from the ITN
  dispatch path) and `sendDailyLessonDigest` (cron: every `booked` session starting later in
  the current SAST calendar day, max 50/day).
- `app/api/lessons/reminders/send/route.ts` — the daily cron endpoint. Returns
  `{ skipped: "whatsapp_not_configured" }` until credentials exist.
- `lib/notify.ts` — calls the instant confirmation before the email-configuration early
  return, so WhatsApp works even when Resend is not configured.

### Production activation steps

State as of 2026-07-12: Meta app **SpinTribe** (App ID `1757688608571876`), business
**Didiserv** (`271354030617057`), number **+27 68 940 0895** (Phone Number ID
`1265993429922178`, WABA `4455209364717365`), migration applied, access token + phone number
id set in Vercel.

1. **Templates** in WhatsApp Manager (category: Utility, language: English) with these exact
   bodies. The legacy `lesson_reminder_24h`/`lesson_reminder_1h` templates are approved but no
   longer used by code — safe to delete.

   `lesson_confirmed` (instant confirmation):

   ```text
   Hi {{1}}, your SpinTribe Coaching {{2}} is confirmed for {{3}}.

   Meet: {{4}}
   Your calendar invite is in your email. Reply here if anything changes.
   ```

   `lesson_today` (daily digest):

   ```text
   Hi {{1}}, you've got a SpinTribe session today at {{2}} with {{3}}.

   Meet: {{4}}
   Reply here if anything changes.
   ```

2. **Env vars** (placeholders in `.env.example`): `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID=1265993429922178`, optionally `WHATSAPP_API_VERSION` (default
   v25.0), `WHATSAPP_SEND_MODE`, `WHATSAPP_TEMPLATE_CONFIRMATION`, `WHATSAPP_TEMPLATE_TODAY`,
   `WHATSAPP_TEMPLATE_LANGUAGE` (defaults match the template names above). A **payment method**
   on the WhatsApp account is required for business-initiated sends beyond the free allowance.

3. **CRON_SECRET**: generate a strong random value (e.g.
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), paste it into
   Vercel → spintribe26 → Settings → Environment Variables → `CRON_SECRET` (Production; add to
   Preview too if cron testing on previews is wanted), and redeploy. Vercel automatically sends
   `Authorization: Bearer <CRON_SECRET>` on its cron invocations when the env var exists. The
   same secret guards `/api/leagues/assign-monthly` — without it, BOTH crons 401 in production.

4. **Cron cadence**: `vercel.json` schedules `/api/lessons/reminders/send` daily at
   `0 2 * * *` (02:00 UTC = 04:00 SAST), within Vercel Hobby's daily-cron limit. No external
   scheduler is required.

### Caveats

- Business-initiated WhatsApp messages outside a 24-hour customer-service window **must** use an
  approved template — which is why production runs in template mode. `WHATSAPP_SEND_MODE=text`
  sends the free-form copy above instead, useful only for testing against a number that has
  recently messaged the business.
- Rider-typed numbers are normalised in `lib/whatsapp.ts` (`0XX XXX XXXX` -> `27XXXXXXXXX`);
  the booking API rejects numbers that cannot be normalised, so paid bookings always have a
  messageable number.
- Marketing/utility conversation pricing applies per Meta's rates for the ZA market; utility
  templates are the cheap category, so keep both templates categorised as Utility.

