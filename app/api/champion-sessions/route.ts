import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/champion-sessions — hydrate current user's sessions from Supabase
export async function GET() {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("champion_sessions")
    .select("*")
    .eq("user_strava_id", String(session.athleteId))
    .order("date", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

// POST /api/champion-sessions — persist a new session to Supabase
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("champion_sessions")
    .insert({
      user_strava_id:       String(session.athleteId),
      type:                 body.type,
      notes:                body.notes ?? "",
      zone_id:              body.zoneId   ? Number(body.zoneId) : null,
      zone_name:            body.zoneName ?? "",
      strava_activity_id:   body.stravaActivityId   ?? null,
      strava_activity_name: body.stravaActivityName  ?? "",
      strava_activity_km:   body.stravaActivityKm    ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate_activity" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ session: data }, { status: 201 });
}
