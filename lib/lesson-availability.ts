import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonServiceRow } from "@/lib/lesson-services";

export const LESSON_TIME_ZONE = "Africa/Johannesburg";
export const LESSON_TIME_ZONE_OFFSET = "+02:00";
export const LESSON_SLOT_STEP_MINUTES = 30;
export const LESSON_HOLD_MINUTES = 30;

export type LessonAvailabilityRuleRow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

export type LessonBlackoutRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export type LessonAvailabilityDay = {
  date: string;
  slots: string[];
};

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function lessonMinLeadHours() {
  return integerEnv("LESSON_MIN_LEAD_HOURS", 12, 1, 168);
}

export function lessonBookingWindowDays() {
  return integerEnv("LESSON_BOOKING_WINDOW_DAYS", 42, 7, 120);
}

export function johannesburgDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LESSON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function addDaysToDateKey(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function weekdayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function isoForDateMinutes(dateKey: string, minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return new Date(`${dateKey}T${hours}:${remainder}:00${LESSON_TIME_ZONE_OFFSET}`).toISOString();
}

function overlaps(startMs: number, endMs: number, otherStart: string, otherEnd: string) {
  return startMs < new Date(otherEnd).getTime() && endMs > new Date(otherStart).getTime();
}

export async function expirePendingLessonHolds(db: SupabaseClient, now = new Date()) {
  const nowIso = now.toISOString();
  const { data: expired, error: lookupError } = await db
    .from("lesson_sessions")
    .select("id,purchase_id")
    .eq("status", "pending_payment")
    .lt("hold_expires_at", nowIso);

  if (lookupError) throw lookupError;
  if (!expired?.length) return;

  const sessionIds = expired.map((row) => String(row.id));
  const purchaseIds = expired.map((row) => row.purchase_id).filter(Boolean) as string[];
  const { error: sessionError } = await db
    .from("lesson_sessions")
    .update({ status: "cancelled", updated_at: nowIso })
    .in("id", sessionIds);
  if (sessionError) throw sessionError;

  if (purchaseIds.length) {
    const { error: purchaseError } = await db
      .from("lesson_purchases")
      .update({ status: "cancelled", updated_at: nowIso })
      .in("id", purchaseIds)
      .eq("status", "pending_payment");
    if (purchaseError) throw purchaseError;
  }
}

export async function getLessonAvailability(
  db: SupabaseClient,
  service: LessonServiceRow,
  options: { fromDate?: string; days?: number; now?: Date; expireHolds?: boolean } = {}
): Promise<LessonAvailabilityDay[]> {
  const now = options.now ?? new Date();
  const today = johannesburgDateKey(now);
  const requestedFrom = options.fromDate && isDateKey(options.fromDate) ? options.fromDate : today;
  const fromDate = requestedFrom < today ? today : requestedFrom;
  const days = Math.min(Math.max(Math.trunc(options.days ?? lessonBookingWindowDays()), 1), 60);
  const rangeEndDate = addDaysToDateKey(fromDate, days);
  const rangeStartIso = new Date(`${fromDate}T00:00:00${LESSON_TIME_ZONE_OFFSET}`).toISOString();
  const rangeEndIso = new Date(`${rangeEndDate}T00:00:00${LESSON_TIME_ZONE_OFFSET}`).toISOString();

  // Booking writes keep this enabled so expired rows cannot trip the overlap
  // constraint. Read-only calendars can skip the cleanup mutation because the
  // busy-session filter below already ignores expired holds.
  if (options.expireHolds !== false) {
    await expirePendingLessonHolds(db, now);
  }

  const [rulesResult, sessionsResult, blackoutsResult] = await Promise.all([
    db.from("lesson_availability_rules").select("id,weekday,start_time,end_time,active").eq("active", true),
    db
      .from("lesson_sessions")
      .select("starts_at,ends_at,status,hold_expires_at")
      .in("status", ["pending_payment", "booked"])
      .lt("starts_at", rangeEndIso)
      .gt("ends_at", rangeStartIso),
    db
      .from("lesson_blackouts")
      .select("id,starts_at,ends_at,reason")
      .lt("starts_at", rangeEndIso)
      .gt("ends_at", rangeStartIso),
  ]);

  if (rulesResult.error) throw rulesResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (blackoutsResult.error) throw blackoutsResult.error;

  const rules = (rulesResult.data ?? []) as LessonAvailabilityRuleRow[];
  const busy = (sessionsResult.data ?? []).filter((session) =>
    session.status === "booked" || !session.hold_expires_at || new Date(session.hold_expires_at).getTime() > now.getTime()
  );
  const blackouts = (blackoutsResult.data ?? []) as LessonBlackoutRow[];
  const durationMinutes = Number(service.duration_minutes ?? 60);
  const minimumStart = now.getTime() + lessonMinLeadHours() * 60 * 60 * 1000;
  const result: LessonAvailabilityDay[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = addDaysToDateKey(fromDate, offset);
    const dayRules = rules.filter((rule) => rule.weekday === weekdayForDateKey(date));
    const slots: string[] = [];

    for (const rule of dayRules) {
      const windowStart = timeMinutes(rule.start_time);
      const windowEnd = timeMinutes(rule.end_time);
      for (let minute = windowStart; minute + durationMinutes <= windowEnd; minute += LESSON_SLOT_STEP_MINUTES) {
        const startsAt = isoForDateMinutes(date, minute);
        const startMs = new Date(startsAt).getTime();
        const endMs = startMs + durationMinutes * 60 * 1000;
        if (startMs < minimumStart) continue;
        if (busy.some((row) => overlaps(startMs, endMs, row.starts_at, row.ends_at))) continue;
        if (blackouts.some((row) => overlaps(startMs, endMs, row.starts_at, row.ends_at))) continue;
        slots.push(startsAt);
      }
    }

    result.push({ date, slots: Array.from(new Set(slots)).sort() });
  }

  return result;
}

export function isSlotConstraintError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "23P01" || Boolean(error?.message?.includes("lesson_sessions_no_active_overlap"));
}
