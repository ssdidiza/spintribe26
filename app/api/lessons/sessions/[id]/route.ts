import { NextRequest, NextResponse } from "next/server";
import { LessonSessionRow, LessonSessionStatus, serializeLessonSession } from "@/lib/lessons";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_STATUSES: LessonSessionStatus[] = ["booked", "completed", "cancelled", "no_show", "coach_cancelled"];

async function hasLedgerEvent(
  db: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
  eventType: "booking_released" | "session_completed" | "no_show"
) {
  const { data, error } = await db
    .from("lesson_credit_ledger")
    .select("id")
    .eq("session_id", sessionId)
    .eq("event_type", eventType)
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

async function addStatusLedgerEvent(
  db: ReturnType<typeof supabaseAdmin>,
  lessonSession: LessonSessionRow,
  eventType: "booking_released" | "session_completed" | "no_show",
  creditDelta: number,
  actorId: string
) {
  if (await hasLedgerEvent(db, lessonSession.id, eventType)) return;

  const { error } = await db.from("lesson_credit_ledger").insert({
    purchase_id: lessonSession.purchase_id,
    session_id: lessonSession.id,
    user_strava_id: lessonSession.user_strava_id,
    event_type: eventType,
    credit_delta: creditDelta,
    reason:
      eventType === "booking_released"
        ? "Lesson booking cancelled"
        : eventType === "session_completed"
          ? "Lesson completed"
          : "Lesson marked as no-show",
    created_by: actorId,
  });

  if (error) throw error;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const requestedStatus = body.status ? String(body.status) as LessonSessionStatus : null;
  if (requestedStatus && !VALID_STATUSES.includes(requestedStatus)) {
    return NextResponse.json({ error: "Invalid lesson session status" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const [{ data: lessonSession, error: sessionError }, { data: caller, error: callerError }] = await Promise.all([
    db.from("lesson_sessions").select("*").eq("id", id).maybeSingle(),
    db.from("users").select("strava_id,role").eq("strava_id", userId).maybeSingle(),
  ]);

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 500 });
  if (!lessonSession) return NextResponse.json({ error: "Lesson session not found" }, { status: 404 });

  const row = lessonSession as LessonSessionRow;
  const isOwner = String(row.user_strava_id) === userId;
  const isAdmin = caller?.role === "admin";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isAdmin && requestedStatus && requestedStatus !== "cancelled") {
    return NextResponse.json({ error: "Only coaches can complete or mark lessons as no-show" }, { status: 403 });
  }

  if (requestedStatus && requestedStatus !== row.status && row.status !== "booked") {
    return NextResponse.json({ error: "This lesson has already been finalized" }, { status: 409 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (requestedStatus) patch.status = requestedStatus;
  if (isAdmin && typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 1000);
  if (typeof body.clientNotes === "string") patch.client_notes = body.clientNotes.trim().slice(0, 500);

  const { data: updated, error: updateError } = await db
    .from("lesson_sessions")
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  try {
    if (requestedStatus === "cancelled" || requestedStatus === "coach_cancelled") {
      await addStatusLedgerEvent(db, row, "booking_released", Number(row.credit_amount ?? 0), userId);
    } else if (requestedStatus === "completed") {
      await addStatusLedgerEvent(db, row, "session_completed", 0, userId);
    } else if (requestedStatus === "no_show") {
      await addStatusLedgerEvent(db, row, "no_show", 0, userId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lesson ledger update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ session: serializeLessonSession(updated as LessonSessionRow) });
}
