import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isWhatsAppConfigured,
  normalizeWhatsAppNumber,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  whatsAppSendMode,
} from "@/lib/whatsapp";

/**
 * Durable WhatsApp reminder queue (lesson_reminders table). Rows are
 * enqueued from the booking notification dispatch path immediately after
 * PayFast confirmation, then drained by /api/lessons/reminders/send.
 * Payloads carry rider-typed booking fields only — never Strava metrics.
 */

export type LessonReminderKind = "reminder_24h" | "reminder_1h";

export type LessonReminderPayload = {
  firstName: string;
  serviceName: string;
  /** Cloud-API formatted number (E.164 digits, no +). */
  phone: string;
  startsAt: string;
  /** Pre-rendered HH:mm in Africa/Johannesburg. */
  timeSast: string;
  meetingPoint: string;
  shortGoal: string;
};

const HOUR_MS = 60 * 60 * 1000;
const MAX_SEND_ATTEMPTS = 3;
/** A reminder this far past due is stale — skip it rather than send late. */
const STALE_AFTER_MS = 6 * HOUR_MS;

function formatTimeSast(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function shortGoalOf(notes: string | null | undefined) {
  const goal = (notes ?? "").trim().replace(/\s+/g, " ");
  if (!goal) return "Ride strong";
  return goal.length > 80 ? `${goal.slice(0, 77)}...` : goal;
}

export async function enqueueLessonWhatsAppReminders(
  db: SupabaseClient,
  input: {
    sessionId: string;
    serviceName: string;
    startsAt: string;
    location?: string | null;
    notes?: string | null;
    customerName: string;
    customerPhone: string;
  }
) {
  const phone = normalizeWhatsAppNumber(input.customerPhone);
  if (!phone) return { enqueued: 0 };
  const starts = new Date(input.startsAt);
  if (Number.isNaN(starts.getTime())) return { enqueued: 0 };

  const payload: LessonReminderPayload = {
    firstName: firstNameOf(input.customerName),
    serviceName: input.serviceName,
    phone,
    startsAt: starts.toISOString(),
    timeSast: formatTimeSast(starts),
    meetingPoint: input.location?.trim() || "As arranged with your coach",
    shortGoal: shortGoalOf(input.notes),
  };

  const now = Date.now();
  const rows = (
    [
      { kind: "reminder_24h", scheduledFor: new Date(starts.getTime() - 24 * HOUR_MS) },
      { kind: "reminder_1h", scheduledFor: new Date(starts.getTime() - 1 * HOUR_MS) },
    ] as const
  )
    // A booking made inside the reminder window skips that reminder — a
    // "see you tomorrow" message for a session in two hours reads wrong.
    .filter((row) => row.scheduledFor.getTime() > now)
    .map((row) => ({
      session_id: input.sessionId,
      channel: "whatsapp",
      kind: row.kind,
      scheduled_for: row.scheduledFor.toISOString(),
      payload,
    }));
  if (!rows.length) return { enqueued: 0 };

  const { error } = await db
    .from("lesson_reminders")
    .upsert(rows, { onConflict: "session_id,channel,kind", ignoreDuplicates: true });
  if (error) throw new Error(`Unable to enqueue lesson reminders: ${error.message}`);
  return { enqueued: rows.length };
}

/**
 * Message copy from docs/spintribe-coaching-booking-flow.md, verbatim.
 * Used as-is in text mode; in template mode the same fields map onto the
 * approved WhatsApp template body placeholders (see the doc for bodies).
 */
export function renderReminderText(kind: LessonReminderKind, payload: LessonReminderPayload) {
  if (kind === "reminder_24h") {
    return `Hi ${payload.firstName}, reminder for your SpinTribe Coaching ${payload.serviceName} tomorrow at ${payload.timeSast}.

Meet: ${payload.meetingPoint}
Goal: ${payload.shortGoal}

Reply here if anything changes.`;
  }
  return `Hi ${payload.firstName}, your SpinTribe Coaching session starts in about 1 hour at ${payload.timeSast}.

Meet: ${payload.meetingPoint}
Bring: helmet, water, charged devices, and anything you want checked before the ride.`;
}

/** Template params may not contain newlines or runs of 4+ spaces. */
function templateParam(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function reminderTemplateName(kind: LessonReminderKind) {
  return kind === "reminder_24h"
    ? process.env.WHATSAPP_TEMPLATE_REMINDER_24H?.trim() || "lesson_reminder_24h"
    : process.env.WHATSAPP_TEMPLATE_REMINDER_1H?.trim() || "lesson_reminder_1h";
}

export function reminderTemplateParams(kind: LessonReminderKind, payload: LessonReminderPayload) {
  if (kind === "reminder_24h") {
    return [
      payload.firstName,
      payload.serviceName,
      payload.timeSast,
      payload.meetingPoint,
      payload.shortGoal,
    ].map(templateParam);
  }
  return [payload.firstName, payload.timeSast, payload.meetingPoint].map(templateParam);
}

type LessonReminderRow = {
  id: string;
  session_id: string;
  kind: LessonReminderKind;
  scheduled_for: string;
  status: string;
  attempts: number;
  payload: LessonReminderPayload;
};

async function finishReminder(
  db: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
) {
  const { error } = await db
    .from("lesson_reminders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    // Surfaced in Vercel runtime logs; the row would otherwise sit in
    // "sending" with no trace of why.
    console.error(`lesson_reminders: failed to update ${id}: ${error.message}`);
  }
}

/**
 * Drain due reminders. Each row is claimed with a conditional update
 * (pending -> sending) so overlapping cron runs never double-send.
 */
export async function sendDueLessonReminders(
  db: SupabaseClient,
  options: { now?: Date; limit?: number } = {}
) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;
  const summary = { due: 0, sent: 0, skipped: 0, failed: 0, retried: 0 };

  const { data, error } = await db
    .from("lesson_reminders")
    .select("id,session_id,kind,scheduled_for,status,attempts,payload")
    .eq("status", "pending")
    .eq("channel", "whatsapp")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to load due reminders: ${error.message}`);

  const due = (data ?? []) as LessonReminderRow[];
  summary.due = due.length;

  for (const reminder of due) {
    // Claim: only proceed if this run flipped the row from pending.
    const { data: claimed, error: claimError } = await db
      .from("lesson_reminders")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", reminder.id)
      .eq("status", "pending")
      .select("id");
    if (claimError) {
      console.error(`lesson_reminders: failed to claim ${reminder.id}: ${claimError.message}`);
      continue;
    }
    if (!claimed?.length) continue;

    // Stale rows (e.g. cron was down) are skipped, not sent hours late.
    if (now.getTime() - new Date(reminder.scheduled_for).getTime() > STALE_AFTER_MS) {
      await finishReminder(db, reminder.id, { status: "skipped", error: "stale: past send window" });
      summary.skipped += 1;
      continue;
    }

    // The session must still be booked and still in the future.
    const { data: session } = await db
      .from("lesson_sessions")
      .select("status,starts_at")
      .eq("id", reminder.session_id)
      .maybeSingle();
    const startsAt = session?.starts_at ? new Date(session.starts_at) : null;
    if (!session || session.status !== "booked" || !startsAt || startsAt.getTime() <= now.getTime()) {
      await finishReminder(db, reminder.id, {
        status: "cancelled",
        error: session ? `session ${session.status ?? "unknown"} or already started` : "session missing",
      });
      summary.skipped += 1;
      continue;
    }

    try {
      const payload = reminder.payload;
      const result =
        whatsAppSendMode() === "text"
          ? await sendWhatsAppText({ to: payload.phone, text: renderReminderText(reminder.kind, payload) })
          : await sendWhatsAppTemplate({
              to: payload.phone,
              templateName: reminderTemplateName(reminder.kind),
              bodyParams: reminderTemplateParams(reminder.kind, payload),
            });
      await finishReminder(db, reminder.id, {
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.messageId || null,
        error: null,
        attempts: reminder.attempts + 1,
      });
      summary.sent += 1;
    } catch (sendError) {
      const attempts = reminder.attempts + 1;
      const message = sendError instanceof Error ? sendError.message : "WhatsApp send failed";
      const exhausted = attempts >= MAX_SEND_ATTEMPTS;
      await finishReminder(db, reminder.id, {
        status: exhausted ? "failed" : "pending",
        attempts,
        error: message.slice(0, 500),
      });
      if (exhausted) summary.failed += 1;
      else summary.retried += 1;
    }
  }

  return summary;
}

export { isWhatsAppConfigured };
