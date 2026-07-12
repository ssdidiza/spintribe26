import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLessonIcs } from "@/lib/ics";
import { COACHING_PACKAGE_TIERS, coachingPackageSavingsCents } from "@/lib/coaching-packages";
import { enqueueLessonWhatsAppReminders } from "@/lib/lesson-reminders";

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

function resendFrom() {
  return process.env.RESEND_FROM?.trim() || "SpinTribe <onboarding@resend.dev>";
}

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "").replace(/\/$/, "");
}

function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && coachEmail());
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

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  ics?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;

  const payload: Record<string, unknown> = {
    from: resendFrom(),
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.ics) {
    payload.attachments = [
      {
        filename: "lesson.ics",
        content: Buffer.from(input.ics, "utf-8").toString("base64"),
      },
    ];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
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
  }
) {
  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  const when = formatWhen(starts);
  const contact = [input.customerEmail, input.customerPhone].filter(Boolean).join(" · ");
  const fourSessionBlock = COACHING_PACKAGE_TIERS[0];
  const origin = appOrigin();
  const addBlockUrl = origin && input.reference
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

  // 2. Durable WhatsApp reminder queue (24h + 1h before the session),
  // drained by /api/lessons/reminders/send. Enqueued here — immediately
  // after PayFast confirmation — regardless of email configuration.
  if (input.customerPhone) {
    try {
      await enqueueLessonWhatsAppReminders(db, {
        sessionId: input.sessionId,
        serviceName: input.serviceName,
        startsAt: input.startsAt,
        location: input.location,
        notes: input.notes,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
      });
    } catch {
      // Best-effort like the rest of this path; never block the payment ack.
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

  // 3. Email the coach.
  try {
    await sendEmail({
      to: coachEmail(),
      subject: `New lesson: ${input.customerName} — ${when}`,
      html: `<h2>New lesson booked</h2>
<p><strong>${input.customerName}</strong> booked <strong>${input.serviceName}</strong>.</p>
<ul>
<li><strong>When:</strong> ${when} (${input.durationMinutes} min)</li>
${input.location ? `<li><strong>Where:</strong> ${input.location}</li>` : ""}
${contact ? `<li><strong>Contact:</strong> ${contact}</li>` : ""}
${input.notes ? `<li><strong>Notes:</strong> ${input.notes}</li>` : ""}
</ul>
<p>The calendar invite is attached.</p>`,
      ics,
    });
  } catch {
    // ignore — coach still has the in-app notification
  }

  // 4. Email the student a confirmation + invite.
  if (input.customerEmail) {
    try {
      await sendEmail({
        to: input.customerEmail,
        subject: `Your SpinTribe Coaching session is confirmed - ${when}`,
        html: `<h2>You're booked in</h2>
<p>Hi ${input.customerName}, your <strong>${input.serviceName}</strong> with <strong>SpinTribe Coaching</strong> is confirmed.</p>
<ul>
<li><strong>When:</strong> ${when} (${input.durationMinutes} min)</li>
${input.location ? `<li><strong>Where:</strong> ${input.location}</li>` : ""}
</ul>
<p>The calendar invite is attached. You can also add it from the confirmation screen.</p>
${addBlockUrl ? `<hr />
<h3>Keep the progression going</h3>
<p>After one session, the best next step is a structured Performance Block: four FTP-based sessions with continuity, follow-up, and a lower per-session rate.</p>
<p><a href="${addBlockUrl}">Add the 4-session Performance Block</a> and save R${Math.round(coachingPackageSavingsCents(fourSessionBlock) / 100)} versus booking four Skills &amp; Training Rides one at a time.</p>` : ""}
<p>Already use SpinTribe? Sign in with Strava from the confirmation screen if you want this lesson linked to your own SpinTribe history. Booking and reminders do not pull Strava metrics.</p>`,
        ics,
      });
    } catch {
      // ignore — booking is already confirmed
    }
  }
}
