import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";

export const runtime = "nodejs";

const CYCLING_TYPES = ["Ride", "VirtualRide", "EBikeRide", "Velomobile"];

export async function GET(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const { data: activities, error: activitiesError } = await ctx.db
    .from("activities")
    .select("id,strava_id,user_strava_id,name,distance,elevation_gain,moving_time,type,date")
    .eq("user_strava_id", userId)
    .in("type", CYCLING_TYPES)
    .order("date", { ascending: false })
    .limit(200);
  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  const activityIds = (activities ?? []).map((activity) => activity.id);
  const attributionsResult = activityIds.length
    ? await ctx.db
        .from("lesson_activity_attributions")
        .select("id,activity_id,session_id,notes,created_at")
        .in("activity_id", activityIds)
    : { data: [], error: null };
  if (attributionsResult.error) {
    return NextResponse.json({ error: attributionsResult.error.message }, { status: 500 });
  }

  const attributionByActivity = new Map(
    (attributionsResult.data ?? []).map((row) => [String(row.activity_id), row])
  );
  return NextResponse.json({
    activities: (activities ?? []).map((activity) => ({
      ...activity,
      attribution: attributionByActivity.get(String(activity.id)) ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const userId = String(body.userId ?? "").trim();
  const rawActivityIds: unknown[] = Array.isArray(body.activityIds) ? body.activityIds : [];
  const activityIds = Array.from(new Set<number>(rawActivityIds.map((value) => Number(value))))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .slice(0, 100);
  const sessionId = body.sessionId ? String(body.sessionId).trim() : null;
  const notes = String(body.notes ?? "Coached cycling lesson").trim().slice(0, 300);

  if (!userId || !activityIds.length) {
    return NextResponse.json({ error: "Choose a rider and at least one activity" }, { status: 400 });
  }

  const { data: ownedActivities, error: activityError } = await ctx.db
    .from("activities")
    .select("id")
    .eq("user_strava_id", userId)
    .in("type", CYCLING_TYPES)
    .in("id", activityIds);
  if (activityError) return NextResponse.json({ error: activityError.message }, { status: 500 });
  if ((ownedActivities ?? []).length !== activityIds.length) {
    return NextResponse.json({ error: "One or more activities do not belong to this rider" }, { status: 403 });
  }

  if (sessionId) {
    const { data: lessonSession, error: sessionError } = await ctx.db
      .from("lesson_sessions")
      .select("id,user_strava_id,purchase_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    if (!lessonSession) return NextResponse.json({ error: "Lesson session not found" }, { status: 404 });
    if (lessonSession.user_strava_id && String(lessonSession.user_strava_id) !== userId) {
      return NextResponse.json({ error: "That lesson belongs to another rider" }, { status: 409 });
    }
    if (!lessonSession.user_strava_id) {
      const { error: linkError } = await ctx.db
        .from("lesson_sessions")
        .update({ user_strava_id: userId, updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  const rows = activityIds.map((activityId) => ({
    activity_id: activityId,
    user_strava_id: userId,
    session_id: sessionId,
    attributed_by: ctx.userId,
    source: "admin",
    notes,
  }));
  const { data, error } = await ctx.db
    .from("lesson_activity_attributions")
    .upsert(rows, { onConflict: "activity_id" })
    .select("id,activity_id,session_id,notes,created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attributions: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const activityId = Number(req.nextUrl.searchParams.get("activityId"));
  if (!Number.isSafeInteger(activityId) || activityId <= 0) {
    return NextResponse.json({ error: "activityId is required" }, { status: 400 });
  }
  const { error } = await ctx.db.from("lesson_activity_attributions").delete().eq("activity_id", activityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
