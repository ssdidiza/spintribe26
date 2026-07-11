import { NextRequest, NextResponse } from "next/server";
import {
  buildLessonSummary,
  creditsForDuration,
  LessonLedgerRow,
  LessonPurchaseRow,
  LessonSessionRow,
  serializeLessonSession,
} from "@/lib/lessons";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { isSlotConstraintError } from "@/lib/lesson-availability";

async function getAvailableCredits(db: ReturnType<typeof supabaseAdmin>, userId: string) {
  const [purchasesResult, sessionsResult, ledgerResult] = await Promise.all([
    db.from("lesson_purchases").select("*").eq("user_strava_id", userId),
    db.from("lesson_sessions").select("*").eq("user_strava_id", userId),
    db.from("lesson_credit_ledger").select("*").eq("user_strava_id", userId),
  ]);

  if (purchasesResult.error) throw purchasesResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  return buildLessonSummary(
    (purchasesResult.data ?? []) as LessonPurchaseRow[],
    (sessionsResult.data ?? []) as LessonSessionRow[],
    (ledgerResult.data ?? []) as LessonLedgerRow[]
  ).availableCredits;
}

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabaseAdmin()
      .from("lesson_sessions")
      .select("*")
      .eq("user_strava_id", userId)
      .order("starts_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ sessions: ((data ?? []) as LessonSessionRow[]).map(serializeLessonSession) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lesson sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const purchaseId = String(body.purchaseId ?? "");
  const startsAtValue = String(body.startsAt ?? "");
  const durationMinutes = Math.round(Number(body.durationMinutes ?? 60));
  const location = String(body.location ?? "").trim().slice(0, 160);
  const clientNotes = String(body.clientNotes ?? "").trim().slice(0, 500);

  if (!purchaseId) return NextResponse.json({ error: "purchaseId is required" }, { status: 400 });
  if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 240) {
    return NextResponse.json({ error: "durationMinutes must be between 30 and 240" }, { status: 400 });
  }

  const startsAt = new Date(startsAtValue);
  if (!Number.isFinite(startsAt.getTime())) {
    return NextResponse.json({ error: "startsAt must be a valid date" }, { status: 400 });
  }
  if (startsAt.getTime() < Date.now() - 15 * 60 * 1000) {
    return NextResponse.json({ error: "Choose a future lesson time" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: purchase, error: purchaseError } = await db
    .from("lesson_purchases")
    .select("*")
    .eq("id", purchaseId)
    .eq("user_strava_id", userId)
    .maybeSingle();

  if (purchaseError) return NextResponse.json({ error: purchaseError.message }, { status: 500 });
  if (!purchase) return NextResponse.json({ error: "Lesson package not found" }, { status: 404 });
  if ((purchase as LessonPurchaseRow).status !== "paid") {
    return NextResponse.json({ error: "This package is not paid yet" }, { status: 409 });
  }

  const creditAmount = creditsForDuration(durationMinutes);
  const availableCredits = await getAvailableCredits(db, userId);
  if (creditAmount > availableCredits) {
    return NextResponse.json({ error: "Not enough available lesson credits" }, { status: 409 });
  }

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const { data: inserted, error: insertError } = await db
    .from("lesson_sessions")
    .insert({
      purchase_id: purchaseId,
      user_strava_id: userId,
      status: "booked",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      duration_minutes: durationMinutes,
      credit_amount: creditAmount,
      location,
      client_notes: clientNotes,
    })
    .select("*")
    .single();

  if (insertError) {
    if (isSlotConstraintError(insertError)) {
      return NextResponse.json({ error: "That time is no longer available. Choose another slot." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const bookedSession = inserted as LessonSessionRow;
  const { error: ledgerError } = await db.from("lesson_credit_ledger").insert({
    purchase_id: purchaseId,
    session_id: bookedSession.id,
    user_strava_id: userId,
    event_type: "booking_hold",
    credit_delta: -creditAmount,
    reason: "Lesson booked",
    created_by: userId,
  });

  if (ledgerError) {
    await db.from("lesson_sessions").delete().eq("id", bookedSession.id);
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  return NextResponse.json({ session: serializeLessonSession(bookedSession) });
}
