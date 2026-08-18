import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailConfigured, sendEmail } from "@/lib/email";

/**
 * A lightweight day-of reminder. Booking confirmation and the reusable
 * scheduling link are already sent by email; the attached calendar event
 * carries its own one-day and two-hour alerts.
 */

export type LessonEmailReminderPayload = {
  firstName: string;
  serviceName: string;
  email: string;
  startsAt: string;
  timeSast: string;
  whenSast: string;
  meetingPoint: string;
  coachName: string;
};

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function coachName() {
  return process.env.LESSON_COACH_NAME?.trim() || "SpinTribe Coaching";
}

function formatTimeSast(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function formatWhenSast(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPayload(input: {
  serviceName: string;
  startsAt: string;
  location?: string | null;
  customerName: string;
  customerEmail: string;
}): LessonEmailReminderPayload | null {
  if (!isValidEmail(input.customerEmail)) return null;
  const starts = new Date(input.startsAt);
  if (Number.isNaN(starts.getTime())) return null;

  return {
    firstName: firstNameOf(input.customerName),
    serviceName: input.serviceName,
    email: input.customerEmail.trim().toLowerCase(),
    startsAt: starts.toISOString(),
    timeSast: formatTimeSast(starts),
    whenSast: formatWhenSast(starts),
    meetingPoint: input.location?.trim() || "As arranged with your coach",
    coachName: coachName(),
  };
}

async function claimReminderSlot(
  db: SupabaseClient,
  sessionId: string,
  scheduledFor: string,
  payload: LessonEmailReminderPayload
) {
  const { data, error } = await db
    .from("lesson_reminders")
    .upsert(
      [{
        session_id: sessionId,
        channel: "email",
        kind: "daily_digest",
        scheduled_for: scheduledFor,
        status: "sending",
        payload,
      }],
      { onConflict: "session_id,channel,kind", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    console.error(`lesson_reminders: failed to claim email reminder for session ${sessionId}: ${error.message}`);
    return null;
  }
  return data?.[0]?.id ?? null;
}

async function finishReminder(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await db
    .from("lesson_reminders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error(`lesson_reminders: failed to update ${id}: ${error.message}`);
  }
}

type ReminderSessionRow = {
  id: string;
  starts_at: string;
  location: string | null;
  customer_name: string | null;
  customer_email: string | null;
  lesson_services: { name: string } | null;
};

export async function sendDailyLessonEmailReminders(
  db: SupabaseClient,
  options: { now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const sastNow = new Date(now.getTime() + SAST_OFFSET_MS);
  const dayStartUtc = new Date(
    Date.UTC(sastNow.getUTCFullYear(), sastNow.getUTCMonth(), sastNow.getUTCDate()) - SAST_OFFSET_MS
  );
  const dayEndUtc = new Date(dayStartUtc.getTime() + DAY_MS);
  const summary = { candidates: 0, sent: 0, skipped: 0, failed: 0 };

  const { data, error } = await db
    .from("lesson_sessions")
    .select("id,starts_at,location,customer_name,customer_email,lesson_services:service_id(name)")
    .eq("status", "booked")
    .gt("starts_at", now.toISOString())
    .lt("starts_at", dayEndUtc.toISOString())
    .not("customer_email", "is", null)
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(`Unable to load today's sessions: ${error.message}`);

  const sessions = (data ?? []) as unknown as ReminderSessionRow[];
  summary.candidates = sessions.length;

  for (const session of sessions) {
    const payload = buildPayload({
      serviceName: session.lesson_services?.name || "coaching session",
      startsAt: session.starts_at,
      location: session.location,
      customerName: session.customer_name || "there",
      customerEmail: session.customer_email || "",
    });

    if (!payload) {
      summary.skipped += 1;
      continue;
    }

    const claimId = await claimReminderSlot(db, session.id, now.toISOString(), payload);
    if (!claimId) {
      summary.skipped += 1;
      continue;
    }

    try {
      const result = await sendEmail({
        to: payload.email,
        subject: `Today at ${payload.timeSast}: your SpinTribe session`,
        html: `<h2>Your ride is today</h2>
<p>Hi ${escapeHtml(payload.firstName)}, your <strong>${escapeHtml(payload.serviceName)}</strong> is today at <strong>${escapeHtml(payload.timeSast)}</strong>.</p>
<p><strong>Meet:</strong> ${escapeHtml(payload.meetingPoint)}</p>
<p>Your calendar invite has the full details. Reply to this email if anything changes.</p>`,
      });

      await finishReminder(db, claimId, {
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.sent ? result.messageId : null,
      });
      summary.sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Email send failed";
      await finishReminder(db, claimId, {
        status: "failed",
        attempts: 1,
        error: message.slice(0, 500),
      });
      summary.failed += 1;
    }
  }

  return summary;
}

export { isEmailConfigured };
