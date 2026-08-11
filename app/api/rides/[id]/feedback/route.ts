import { NextRequest, NextResponse } from "next/server";
import { getChampContext } from "@/lib/champ-auth";
import { isFeedbackOpen } from "@/lib/team-rides";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 2000;

/**
 * Private post-ride feedback. One note per rider per ride, revisable.
 *
 * Readable by admins only (GET below). There is no rating and no rated-rider
 * field anywhere in the chain — public ratings between members are an explicit
 * non-goal, so the schema leaves nowhere to put one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChampContext();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;
  const { db, userId } = context;

  let body: { note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) return NextResponse.json({ error: "Write something first" }, { status: 400 });
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_NOTE_LENGTH} characters` },
      { status: 400 }
    );
  }

  const { data: ride, error: rideError } = await db
    .from("team_rides")
    .select("id,starts_at,duration_minutes,status")
    .eq("id", id)
    .maybeSingle();

  if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
  if (!ride) return NextResponse.json({ error: "Ride not found" }, { status: 404 });
  if (!isFeedbackOpen(ride.starts_at, Number(ride.duration_minutes ?? 90))) {
    return NextResponse.json({ error: "Feedback opens once the ride is done" }, { status: 409 });
  }

  const { error } = await db.from("ride_feedback").upsert(
    { ride_id: id, user_strava_id: userId, note },
    { onConflict: "ride_id,user_strava_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Admin-only. Riders cannot read each other's notes, or their own back. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChampContext();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  if (!context.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { data, error } = await context.db
    .from("ride_feedback")
    .select("id,note,created_at,user_strava_id")
    .eq("ride_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data ?? [] });
}
