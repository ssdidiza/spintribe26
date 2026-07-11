import { NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const userId = getEffectiveUserId(await getSession());
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: links, error: linksError } = await db
    .from("lesson_activity_attributions")
    .select("activity_id,session_id,notes,created_at")
    .eq("user_strava_id", userId)
    .order("created_at", { ascending: false });
  if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });

  const activityIds = (links ?? []).map((row) => row.activity_id);
  if (!activityIds.length) return NextResponse.json({ rides: [] });
  const { data: activities, error: activitiesError } = await db
    .from("activities")
    .select("id,strava_id,name,distance,elevation_gain,moving_time,type,date")
    .eq("user_strava_id", userId)
    .in("id", activityIds);
  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });
  const linkByActivity = new Map((links ?? []).map((row) => [String(row.activity_id), row]));
  return NextResponse.json({
    rides: (activities ?? [])
      .map((activity) => ({ ...activity, attribution: linkByActivity.get(String(activity.id)) }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  });
}
