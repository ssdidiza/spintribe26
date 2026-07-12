import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isWhatsAppConfigured,
  normalizeWhatsAppNumber,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  whatsAppSendMode,
} from "@/lib/whatsapp";

/**
 * Lesson WhatsApp messaging, two shapes:
 *
 * 1. Instant booking confirmation — sent the moment PayFast confirms, from
 *    the same dispatch path as the confirmation email. Never waits for a
 *    cron. Logged (and deduped against ITN retries) via a lesson_reminders
 *    row with kind 'confirmation'.
 * 2. Daily digest — /api/lessons/reminders/send runs once a day at 04:00
 *    SAST (Vercel Hobby allows daily crons only) and messages every rider
 *    with a session later that SAST calendar day. Deduped per session via
 *    kind 'daily_digest'.
 *
 * Payloads carry rider-typed booking fields only — never Strava metrics.
 */

export type LessonWhatsAppPayload = {
  firstName: string;
  serviceName: string;
  /** Cloud-API formatted number (E.164 digits, no +). */
  phone: string;
  startsAt: string;
  /** Pre-rendered HH:mm in Africa/Johannesburg. */
  timeSast: string;
  /** Pre-rendered "Mon, 13 Jul, 06:00" in Africa/Johannesburg. */
  whenSast: string;
  meetingPoint: string;
  coachName: string;
};

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000; // UTC+2, no DST
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

function buildPayload(input: {
  serviceName: string;
  startsAt: string;
  location?: string | null;
  customerName: string;
  customerPhone: string;
}): LessonWhatsAppPayload | null {
  const phone = normalizeWhatsAppNumber(input.customerPhone);
  if (!phone) return null;
  const starts = new Date(input.startsAt);
  if (Number.isNaN(starts.getTime())) return null;
  return {
    firstName: firstNameOf(input.customerName),
    serviceName: input.serviceName,
    phone,
    startsAt: starts.toISOString(),
    timeSast: formatTimeSast(starts),
    whenSast: formatWhenSast(starts),
    meetingPoint: input.location?.trim() || "As arranged with your coach",
    coachName: coachName(),
  };
}

/** Template params may not contain newlines or runs of 4+ spaces. */
function templateParam(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function confirmationTemplateName() {
  return process.env.WHATSAPP_TEMPLATE_CONFIRMATION?.trim() || "lesson_confirmed";
}

function digestTemplateName() {
  return process.env.WHATSAPP_TEMPLATE_TODAY?.trim() || "lesson_today";
}

export function renderConfirmationText(payload: LessonWhatsAppPayload) {
  return `Hi ${payload.firstName}, your SpinTribe Coaching ${payload.serviceName} is confirmed for ${payload.whenSast}.

Meet: ${payload.meetingPoint}
Your calendar invite is in your email. Reply here if anything changes.`;
}

export function renderDigestText(payload: LessonWhatsAppPayload) {
  return `Hi ${payload.firstName}, you've got a SpinTribe session today at ${payload.timeSast} with ${payload.coachName}.

Meet: ${payload.meetingPoint}
Reply here if anything changes.`;
}

async function sendViaWhatsApp(kind: "confirmation" | "daily_digest", payload: LessonWhatsAppPayload) {
  if (whatsAppSendMode() === "text") {
    const text = kind === "confirmation" ? renderConfirmationText(payload) : renderDigestText(payload);
    return sendWhatsAppText({ to: payload.phone, text });
  }
  if (kind === "confirmation") {
    return sendWhatsAppTemplate({
      to: payload.phone,
      templateName: confirmationTemplateName(),
      bodyParams: [payload.firstName, payload.serviceName, payload.whenSast, payload.meetingPoint].map(templateParam),
    });
  }
  return sendWhatsAppTemplate({
    to: payload.phone,
    templateName: digestTemplateName(),
    bodyParams: [payload.firstName, payload.timeSast, payload.coachName, payload.meetingPoint].map(templateParam),
  });
}

/**
 * Claim a (session, kind) slot in lesson_reminders. Returns the row id if
 * this caller inserted it (and therefore owns the send), null if another
 * run — or an ITN retry — already did.
 */
async function claimMessageSlot(
  db: SupabaseClient,
  sessionId: string,
  kind: "confirmation" | "daily_digest",
  scheduledFor: string,
  payload: LessonWhatsAppPayload
) {
  const { data, error } = await db
    .from("lesson_reminders")
    .upsert(
      [{ session_id: sessionId, channel: "whatsapp", kind, scheduled_for: scheduledFor, status: "sending", payload }],
      { onConflict: "session_id,channel,kind", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    console.error(`lesson_reminders: failed to claim ${kind} for session ${sessionId}: ${error.message}`);
    return null;
  }
  return data?.[0]?.id ?? null;
}

async function finishMessage(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await db
    .from("lesson_reminders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error(`lesson_reminders: failed to update ${id}: ${error.message}`);
  }
}

/**
 * Instant WhatsApp booking confirmation. Best-effort: any failure is
 * recorded on the log row and swallowed — it must never block the ITN ack.
 */
export async function sendLessonWhatsAppConfirmation(
  db: SupabaseClient,
  input: {
    sessionId: string;
    serviceName: string;
    startsAt: string;
    location?: string | null;
    customerName: string;
    customerPhone: string;
  }
) {
  if (!isWhatsAppConfigured()) return { sent: false, reason: "whatsapp_not_configured" };
  const payload = buildPayload(input);
  if (!payload) return { sent: false, reason: "invalid_phone_or_date" };

  const now = new Date().toISOString();
  const claimId = await claimMessageSlot(db, input.sessionId, "confirmation", now, payload);
  if (!claimId) return { sent: false, reason: "already_sent" };

  try {
    const result = await sendViaWhatsApp("confirmation", payload);
    await finishMessage(db, claimId, {
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: result.messageId || null,
    });
    return { sent: true };
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "WhatsApp send failed";
    await finishMessage(db, claimId, { status: "failed", attempts: 1, error: message.slice(0, 500) });
    return { sent: false, reason: message };
  }
}

type DigestSessionRow = {
  id: string;
  starts_at: string;
  location: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  lesson_services: { name: string } | null;
};

/**
 * Daily 04:00 SAST digest: one message per rider with a booked session
 * later in the current SAST calendar day.
 */
export async function sendDailyLessonDigest(db: SupabaseClient, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  // SAST midnight of "today" expressed in UTC, without DST concerns (UTC+2 fixed).
  const sastNow = new Date(now.getTime() + SAST_OFFSET_MS);
  const dayStartUtc = new Date(
    Date.UTC(sastNow.getUTCFullYear(), sastNow.getUTCMonth(), sastNow.getUTCDate()) - SAST_OFFSET_MS
  );
  const dayEndUtc = new Date(dayStartUtc.getTime() + DAY_MS);

  const summary = { candidates: 0, sent: 0, skipped: 0, failed: 0 };

  const { data, error } = await db
    .from("lesson_sessions")
    .select("id,starts_at,location,customer_name,customer_phone,lesson_services:service_id(name)")
    .eq("status", "booked")
    .gt("starts_at", now.toISOString())
    .lt("starts_at", dayEndUtc.toISOString())
    .not("customer_phone", "is", null)
    .order("starts_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`Unable to load today's sessions: ${error.message}`);

  const sessions = (data ?? []) as unknown as DigestSessionRow[];
  summary.candidates = sessions.length;

  for (const session of sessions) {
    const payload = buildPayload({
      serviceName: session.lesson_services?.name || "coaching session",
      startsAt: session.starts_at,
      location: session.location,
      customerName: session.customer_name || "there",
      customerPhone: session.customer_phone || "",
    });
    if (!payload) {
      summary.skipped += 1;
      continue;
    }

    const claimId = await claimMessageSlot(db, session.id, "daily_digest", now.toISOString(), payload);
    if (!claimId) {
      summary.skipped += 1; // already messaged (rerun or duplicate cron)
      continue;
    }

    try {
      const result = await sendViaWhatsApp("daily_digest", payload);
      await finishMessage(db, claimId, {
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.messageId || null,
      });
      summary.sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "WhatsApp send failed";
      await finishMessage(db, claimId, { status: "failed", attempts: 1, error: message.slice(0, 500) });
      summary.failed += 1;
    }
  }

  return summary;
}

export { isWhatsAppConfigured };
