# SpinTribe coaching booking flow

## Product rule

Booking must work without a SpinTribe or Strava account. Strava is optional and
only powers the rider's private progress view.

## Rider flow

1. Choose a single session, coaching block, or mixed cart on `/book`.
2. Pick the first available time when the selected offer requires one.
3. Enter a name and email. Phone, meeting point, and coaching notes are optional.
4. Review the total and continue to PayFast.
5. After payment:
   - a single session is confirmed immediately;
   - a package receives one reusable `/schedule?token=...` link by email;
   - every scheduled session receives its own calendar invite.

There is one checkout path. Signed-in riders and guests use the same `/book`
flow.

## Reminders

Resend email and calendar alerts are the only reminder channels:

- Payment confirmation and receipt are sent by email.
- The personal package scheduling link is sent by email.
- Every confirmed session includes an ICS calendar invite with alerts one day
  and two hours before the session.
- The existing 04:00 SAST Vercel cron sends one short day-of email, deduped by
  `lesson_reminders`.
- The signed-in Home screen shows the rider's next session or next booking
  action.

The reminder path is best-effort and never blocks PayFast confirmation.

## Implementation map

- `app/book/page.tsx` — public cart and booking flow.
- `app/schedule/page.tsx` — package session scheduling.
- `app/book/confirmed/page.tsx` — payment confirmation and calendar download.
- `lib/notify.ts` — payment and booking confirmation emails.
- `lib/lesson-reminders.ts` — day-of email reminder.
- `lib/ics.ts` — calendar invite and alerts.
- `app/api/lessons/reminders/send/route.ts` — cron endpoint.
- `supabase/email-reminders-migration.sql` — enables email reminder log rows
  while preserving historical delivery records.

## Kill criterion

Remove the extra day-of email if calendar alerts and the signed-in Home screen
keep missed-session rates unchanged for three months. Confirmation emails and
calendar invites remain because they carry booking details.

Remove the private `/progress` view if fewer than 20% of Strava-connected
clients visit it in a rolling three-month period. Booking remains unchanged.
