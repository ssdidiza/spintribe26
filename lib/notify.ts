import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGoogleCalendarUrl, buildLessonIcs } from "@/lib/ics";
import { COACHING_PACKAGE_TIERS, coachingPackageSavingsCents } from "@/lib/coaching-packages";
import { isEmailConfigured, sendEmail } from "@/lib/email";

/**
 * Booking notifications, modelled on PayFast/Xero: best-effort and
 * non-blocking. The in-app notification to the coach always fires (no infra);
 * the email + calendar invite light up the moment RESEND_API_KEY is set.
 */

function coachStravaId() {
  return (
    process.env.FOUNDER_STRAVA_ID?.trim() ||
    process.env.FOUNDER_STRAVA_IDS?.split(",")[0]?.trim() ||
    ""
  );
}

function coachEmail() {
  return process.env.LESSON_COACH_EMAIL?.trim() || process.env.FOUNDER_EMAIL?.trim() || "";
}

function coachName() {
  return process.env.LESSON_COACH_NAME?.trim() || "SpinTribe Coaching";
}

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "").replace(/\/$/, "");
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatWhen(startsAt: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(startsAt);
}

export async function dispatchLessonBookingNotifications(
  db: SupabaseClient,
  input: {
    sessionId: string;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
    location?: string | null;
    notes?: string | null;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    reference?: string | null;
    /** Set for package/cart purchases with sessions still to schedule. */
    scheduleUrl?: string | null;
    remainingSessions?: number;
  }
) {
  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  const when = formatWhen(starts);
  const contact = [input.customerEmail, input.customerPhone].filter(Boolean).join(" · ");
  const customerNameHtml = escapeHtml(input.customerName);
  const serviceNameHtml = escapeHtml(input.serviceName);
  const locationHtml = input.location ? escapeHtml(input.location) : "";
  const contactHtml = contact ? escapeHtml(contact) : "";
  const notesHtml = input.notes ? escapeHtml(input.notes) : "";
  const fourSessionBlock = COACHING_PACKAGE_TIERS[0];
  const origin = appOrigin();
  // Upsell a block only after a single session — not to someone who just bought one.
  const addBlockUrl = origin && input.reference && !(input.remainingSessions && input.remainingSessions > 0)
    ? `${origin}/book?package=${encodeURIComponent(fourSessionBlock.id)}&from=${encodeURIComponent(input.reference)}`
    : "";

  // 1. In-app notification for the coach (always — reuses the notifications table).
  const stravaId = coachStravaId();
  if (stravaId) {
    try {
      await db.from("notifications").upsert(
        {
          user_strava_id: stravaId,
          type: "info",
          title: `New lesson booked: ${input.customerName}`,
          body: `${input.serviceName} on ${when} (${input.durationMinutes} min)${
            input.location ? ` at ${input.location}` : ""
          }.${contact ? ` Contact: ${contact}.` : ""}${input.notes ? ` Notes: ${input.notes}` : ""}`,
          dedupe_key: `lesson_booked:${input.sessionId}`,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );
    } catch {
      // Notification table is best-effort; never block the payment path.
    }
  }

  if (!isEmailConfigured()) return;

  const ics = buildLessonIcs({
    uid: `lesson-${input.sessionId}@spintribe`,
    startsAt: starts,
    endsAt: ends,
    summary: `${input.serviceName} - SpinTribe Coaching`,
    description: input.notes ?? "",
    location: input.location ?? "",
    organizerName: coachName(),
    organizerEmail: coachEmail(),
    attendeeName: input.customerName,
    attendeeEmail: input.customerEmail ?? coachEmail(),
  });
  const googleCalendarUrl = buildGoogleCalendarUrl({
    startsAt: starts,
    endsAt: ends,
    summary: `${input.serviceName} - SpinTribe Coaching`,
    description: input.notes ?? "",
    location: input.location ?? "",
  });
  const googleCalendarHref = escapeHtml(googleCalendarUrl);
  const googleCalendarLink = `<p><a href="${googleCalendarHref}" style="display:inline-block;background:#ff4b35;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Add to Google Calendar</a></p>`;

  // 2. Email the coach.
  if (coachEmail()) {
    try {
      await sendEmail({
        to: coachEmail(),
        subject: `New lesson: ${input.customerName} — ${when}`,
        html: `<h2>New lesson booked</h2>
<p><strong>${customerNameHtml}</strong> booked <strong>${serviceNameHtml}</strong>.</p>
<ul>
<li><strong>When:</strong> ${escapeHtml(when)} (${escapeHtml(input.durationMinutes)} min)</li>
${locationHtml ? `<li><strong>Where:</strong> ${locationHtml}</li>` : ""}
${contactHtml ? `<li><strong>Contact:</strong> ${contactHtml}</li>` : ""}
${notesHtml ? `<li><strong>Notes:</strong> ${notesHtml}</li>` : ""}
</ul>
<p>The calendar invite is attached.</p>
${googleCalendarLink}`,
        attachments: [{ filename: "lesson.ics", content: Buffer.from(ics, "utf-8").toString("base64") }],
      });
    } catch {
      // ignore — coach still has the in-app notification
    }
  }

  // 3. Email the rider a confirmation + invite.
  if (input.customerEmail) {
    try {
      await sendEmail({
        to: input.customerEmail,
        subject: `Your SpinTribe Coaching session is confirmed - ${when}`,
        html: `<h2>You're booked in</h2>
<p>Hi ${customerNameHtml}, your <strong>${serviceNameHtml}</strong> with <strong>SpinTribe Coaching</strong> is confirmed.</p>
<ul>
<li><strong>When:</strong> ${escapeHtml(when)} (${escapeHtml(input.durationMinutes)} min)</li>
${locationHtml ? `<li><strong>Where:</strong> ${locationHtml}</li>` : ""}
</ul>
<p>The calendar invite is attached with reminders for the day before and two hours before. You can also add it from the confirmation screen.</p>
${googleCalendarLink}
${input.scheduleUrl && (input.remainingSessions ?? 0) > 0 ? `<p><strong>You have ${escapeHtml(input.remainingSessions ?? 0)} more session${
          (input.remainingSessions ?? 0) === 1 ? "" : "s"
        } to schedule.</strong> <a href="${escapeHtml(input.scheduleUrl)}">Pick your next time here</a> — keep this link, it's your scheduling page.</p>` : ""}
${addBlockUrl ? `<hr />
<h3>Keep the progression going</h3>
<p>After one session, the best next step is a structured Performance Block: four FTP-based sessions with continuity, follow-up, and a lower per-session rate.</p>
<p><a href="${escapeHtml(addBlockUrl)}">Add the 4-session Performance Block</a> and save R${escapeHtml(Math.round(coachingPackageSavingsCents(fourSessionBlock) / 100))} versus booking four Skills &amp; Training Rides one at a time.</p>` : ""}
<p>Already use SpinTribe? Sign in from the confirmation screen if you want this lesson linked to your private progress history.</p>`,
        attachments: [{ filename: "lesson.ics", content: Buffer.from(ics, "utf-8").toString("base64") }],
      });
    } catch {
      // ignore — booking is already confirmed
    }
  }
}

/**
 * Cart/package payment confirmed: one invoice-style email carrying the
 * /schedule link. No session exists yet — per-session confirmations fire from
 * /schedule as each slot is booked. Best-effort, same contract as
 * dispatchLessonBookingNotifications.
 */
export async function dispatchCartPurchaseNotifications(
  db: SupabaseClient,
  input: {
    purchaseId: string;
    items: Array<{ name: string; quantity: number; unitPriceCents: number }>;
    totalAmountCents: number;
    currency: string;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    scheduleToken: string | null;
    reference?: string | null;
  }
) {
  const origin = appOrigin();
  const scheduleUrl = origin && input.scheduleToken
    ? `${origin}/schedule?token=${encodeURIComponent(input.scheduleToken)}`
    : "";
  const totalSessions = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const summary = input.items.map((item) => `${item.quantity}x ${item.name}`).join(", ");
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const money = (cents: number) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: input.currency || "ZAR" }).format(cents / 100);

  // 1. In-app notification for the coach (deduped against ITN retries).
  const stravaId = coachStravaId();
  if (stravaId) {
    try {
      await db.from("notifications").upsert(
        {
          user_strava_id: stravaId,
          type: "info",
          title: `Package paid: ${input.customerName}`,
          body: `${summary} — ${money(input.totalAmountCents)}. ${totalSessions} session${
            totalSessions === 1 ? "" : "s"
          } to schedule.`,
          dedupe_key: `cart_paid:${input.purchaseId}`,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );
    } catch {
      // best-effort
    }
  }

  const itemRowsHtml = input.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.quantity)}x ${escapeHtml(item.name)}</td><td style="text-align:right">${escapeHtml(money(
          item.quantity * item.unitPriceCents
        ))}</td></tr>`
    )
    .join("");

  // 2. Email the coach.
  if (isEmailConfigured() && coachEmail()) {
    try {
      await sendEmail({
        to: coachEmail(),
        subject: `Package paid: ${input.customerName} — ${totalSessions} sessions to schedule`,
        html: `<h2>Package paid</h2>
<p><strong>${escapeHtml(input.customerName)}</strong> paid ${escapeHtml(money(input.totalAmountCents))} for: ${escapeHtml(summary)}.</p>
<p>They'll schedule their sessions from their link; each booking sends the usual confirmations.</p>`,
      });
    } catch {
      // ignore
    }
  }

  // 3. Email the rider the receipt + schedule link.
  if (input.customerEmail && process.env.RESEND_API_KEY?.trim()) {
    try {
      await sendEmail({
        to: input.customerEmail,
        subject: `Payment received — schedule your ${totalSessions} SpinTribe sessions`,
        html: `<h2>Payment received</h2>
<p>Hi ${escapeHtml(firstName)}, thanks — your SpinTribe Coaching package is confirmed.</p>
<table style="width:100%;max-width:420px">${itemRowsHtml}
<tr><td style="border-top:1px solid #ccc"><strong>Total paid</strong></td><td style="border-top:1px solid #ccc;text-align:right"><strong>${escapeHtml(money(
          input.totalAmountCents
        ))}</strong></td></tr></table>
${scheduleUrl ? `<p style="margin-top:16px"><a href="${escapeHtml(scheduleUrl)}" style="display:inline-block;background:#ff4b35;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Schedule your sessions</a></p>
<p>Keep this link — it's your scheduling page for every session in this package. Each session you book gets its own email confirmation and calendar invite.</p>` : ""}
${input.reference ? `<p style="color:#888;font-size:12px">Payment reference: ${escapeHtml(input.reference)}</p>` : ""}`,
      });
    } catch {
      // ignore — payment is already confirmed
    }
  }
}
