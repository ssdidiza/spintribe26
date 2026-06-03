import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/champion-sessions - hydrate current user's sessions from Supabase.
export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("champion_sessions")
    .select("*")
    .eq("user_strava_id", userId)
    .order("date", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = data ?? [];
  const activityIds = sessions
    .map((s) => s.strava_activity_id)
    .filter((id): id is string => Boolean(id));

  if (activityIds.length === 0) {
    return NextResponse.json({ sessions });
  }

  const { data: activities, error: activityError } = await db
    .from("activities")
    .select("strava_id,date,name,distance")
    .eq("user_strava_id", userId)
    .in("strava_id", activityIds);

  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

  const activityById = new Map(
    (activities ?? []).map((activity) => [String(activity.strava_id), activity])
  );
  const correctedSessions = sessions.map((championSession) => {
    const activity = championSession.strava_activity_id
      ? activityById.get(String(championSession.strava_activity_id))
      : undefined;

    if (!activity) return championSession;

    return {
      ...championSession,
      date: activity.date,
      strava_activity_name: championSession.strava_activity_name || activity.name,
      strava_activity_km: championSession.strava_activity_km ?? Math.round(Number(activity.distance) / 1000),
    };
  });

  return NextResponse.json({ sessions: correctedSessions });
}

// POST /api/champion-sessions - persist a new session to Supabase.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const stravaActivityId = body.stravaActivityId ? String(body.stravaActivityId) : null;
  const numericZoneId = Number(body.zoneId);
  const zoneId = body.zoneId && Number.isFinite(numericZoneId) ? numericZoneId : null;

  if (!["champing", "ftp_improver"].includes(body.type)) {
    return NextResponse.json({ error: "invalid_session_type" }, { status: 400 });
  }

  if (!stravaActivityId && body.type === "champing") {
    return NextResponse.json({ error: "activity_required" }, { status: 422 });
  }

  let activityProof: {
    date: string;
    name: string;
    distance: number;
    detected_zone_id: string | null;
  } | null = null;

  if (stravaActivityId) {
    const { data, error } = await db
      .from("activities")
      .select("date,name,distance,detected_zone_id")
      .eq("user_strava_id", userId)
      .eq("strava_id", stravaActivityId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data && body.type === "champing") {
      return NextResponse.json({ error: "activity_not_synced" }, { status: 422 });
    }
    activityProof = data
      ? {
          date: data.date,
          name: data.name,
          distance: Number(data.distance),
          detected_zone_id: data.detected_zone_id ?? null,
        }
      : null;
  }

  const fallbackDate = body.stravaActivityDate ? new Date(body.stravaActivityDate) : null;
  const sessionDate = activityProof?.date
    ?? (fallbackDate && !Number.isNaN(fallbackDate.getTime()) ? fallbackDate.toISOString() : new Date().toISOString());

  const { data, error } = await db
    .from("champion_sessions")
    .insert({
      user_strava_id: userId,
      type: body.type,
      date: sessionDate,
      notes: body.notes ?? "",
      zone_id: zoneId,
      zone_name: body.zoneName ?? "",
      strava_activity_id: stravaActivityId,
      strava_activity_name: activityProof?.name ?? body.stravaActivityName ?? "",
      strava_activity_km: activityProof
        ? Math.round(activityProof.distance / 1000)
        : body.stravaActivityKm ?? null,
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
