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

## WhatsApp Templates

**Status: implemented** — provider is the **Meta WhatsApp Cloud API** (plain `fetch`, no SDK,
mirroring the Resend email integration). See "WhatsApp reminder implementation" below for the
queue, cron, and production activation steps.

24-hour reminder:

```text
Hi {{first_name}}, reminder for your SpinTribe Coaching {{service_name}} tomorrow at {{time_sast}}.

Meet: {{meeting_point}}
Goal: {{short_goal}}

Reply here if anything changes.
```

1-hour reminder:

```text
Hi {{first_name}}, your SpinTribe Coaching session starts in about 1 hour at {{time_sast}}.

Meet: {{meeting_point}}
Bring: helmet, water, charged devices, and anything you want checked before the ride.
```

## Technical Notes

- PayFast remains the only payment integration for this flow. The booking page posts to `app/api/lessons/book/route.ts`, which creates a `lesson_purchases` row and redirects to PayFast.
- PayFast ITN confirmation lands in `app/api/payfast/notify/route.ts`. After `activateDirectLessonBooking`, it calls `dispatchLessonBookingNotifications` in `lib/notify.ts`.
- ICS generation already lives in `lib/ics.ts`. Confirmation emails attach the generated ICS in `lib/notify.ts`, and the confirmation screen now exposes a calendar download through `app/api/lessons/book/calendar/route.ts`.
- WhatsApp reminders hook immediately after PayFast confirmation, in the same notification dispatch path: `dispatchLessonBookingNotifications` (`lib/notify.ts`) calls `enqueueLessonWhatsAppReminders` (`lib/lesson-reminders.ts`) whenever `customer_phone` is present, writing durable rows to `lesson_reminders` for `starts_at - 24 hours` and `starts_at - 1 hour` (reminders whose send time is already past are skipped at enqueue).
- The cron route `/api/lessons/reminders/send` (GET, `CRON_SECRET`-guarded, scheduled every 10 minutes in `vercel.json`) drains due reminders. Payloads carry only rider-typed booking fields: name, phone, service, date/time, meeting point, and goals.
- The coaching flow must not fetch or display Strava metrics. Optional Strava sign-in should only link the lesson to the rider's own SpinTribe account/history.

## WhatsApp reminder implementation

Implemented with the **Meta WhatsApp Cloud API** (`lib/whatsapp.ts` — plain `fetch` against
`graph.facebook.com`, no SDK dependency). Chosen over Twilio because there is no per-message
middleman markup and the integration style matches the existing Resend email path: best-effort,
env-driven, dormant until credentials are set.

### Moving parts

- `supabase/lesson-reminders-migration.sql` — the `lesson_reminders` queue table
  (`session_id, channel, kind, scheduled_for, status, payload, attempts, provider_message_id,
  sent_at, error`), unique per `(session_id, channel, kind)` so PayFast ITN retries re-enqueue
  idempotently. **Must be run in the Supabase SQL Editor before activation.**
- `lib/lesson-reminders.ts` — enqueue, template rendering (copy above, verbatim), and the drain
  loop. Rows are claimed with a conditional `pending -> sending` update so overlapping cron runs
  never double-send; sends retry up to 3 times; rows more than 6 hours past due are skipped
  rather than sent late; the session is re-checked (`status = 'booked'`, still in the future)
  before every send so cancelled sessions never get reminders.
- `app/api/lessons/reminders/send/route.ts` — the cron endpoint. Returns
  `{ skipped: "whatsapp_not_configured" }` (leaving rows pending) until credentials exist.
- `lib/notify.ts` — the enqueue hook, before the email-configuration early return, so reminders
  queue even when Resend is not configured.

### Production activation steps

Setup state as of 2026-07-12 — steps 1–3 are DONE:

- Meta app: **SpinTribe** (App ID `1757688608571876`), business **Didiserv**
  (`271354030617057`), WhatsApp use case configured.
- Number: **+27 68 940 0895** — Phone Number ID `1265993429922178`,
  WhatsApp Business Account ID `4455209364717365`.
- Both templates submitted (Utility, English/`en`) and **in review**.
- `lesson_reminders` migration applied to the production database.

1. **Run the migration**: `supabase/lesson-reminders-migration.sql` in Supabase SQL Editor.
   ✅ Applied 2026-07-12 (`lesson_reminders_whatsapp_queue`).
2. **Meta setup**: create a Meta Business + app with the WhatsApp product, register the coaching
   number, and generate a **permanent System User access token** (the API Setup page's default
   token expires in 24h). No inbound webhook is required for sending; configure the WhatsApp
   webhook later only if delivery receipts / inbound replies should land in the app.
   ✅ App/number exist — ⏳ still needs the permanent System User token (Business settings ->
   Users -> System users -> Add -> assign the SpinTribe app + WABA -> Generate token with
   `whatsapp_business_messaging`).
3. **Approve the two templates** in WhatsApp Manager (category: Utility, language: English),
   with these exact bodies. ✅ Submitted 2026-07-12, status "In review".

   `lesson_reminder_24h`:

   ```text
   Hi {{1}}, reminder for your SpinTribe Coaching {{2}} tomorrow at {{3}}.

   Meet: {{4}}
   Goal: {{5}}

   Reply here if anything changes.
   ```

   `lesson_reminder_1h`:

   ```text
   Hi {{1}}, your SpinTribe Coaching session starts in about 1 hour at {{2}}.

   Meet: {{3}}
   Bring: helmet, water, charged devices, and anything you want checked before the ride.
   ```
4. **Set Vercel env vars** (placeholders in `.env.example`): `WHATSAPP_ACCESS_TOKEN`
   (the System User token from step 2), `WHATSAPP_PHONE_NUMBER_ID=1265993429922178`, and
   optionally `WHATSAPP_API_VERSION` (default v25.0), `WHATSAPP_SEND_MODE`,
   `WHATSAPP_TEMPLATE_REMINDER_24H`, `WHATSAPP_TEMPLATE_REMINDER_1H`,
   `WHATSAPP_TEMPLATE_LANGUAGE` (template names/language match the defaults, so these can be
   omitted).
   Also add a **payment method** on the WhatsApp account (WhatsApp Manager -> API Setup step 6)
   — required for business-initiated sends beyond the free test allowance.
5. **Cron cadence**: `vercel.json` schedules `/api/lessons/reminders/send` every 10 minutes.
   Vercel **Hobby-plan crons only trigger about once per day** — on Hobby, point an external
   scheduler (e.g. cron-job.org) at the route every 10 minutes with the
   `Authorization: Bearer <CRON_SECRET>` header, or upgrade to Pro.

### Caveats

- Business-initiated WhatsApp messages outside a 24-hour customer-service window **must** use an
  approved template — which is why production runs in template mode. `WHATSAPP_SEND_MODE=text`
  sends the free-form copy above instead, useful only for testing against a number that has
  recently messaged the business.
- Rider-typed numbers are normalised in `lib/whatsapp.ts` (`0XX XXX XXXX` -> `27XXXXXXXXX`);
  numbers that cannot be normalised simply skip reminder enqueue — never a booking failure.
- Marketing/utility conversation pricing applies per Meta's rates for the ZA market; utility
  templates are the cheap category, so keep both templates categorised as Utility.

