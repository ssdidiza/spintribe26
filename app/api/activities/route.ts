import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getEffectiveUserId, getSession } from "@/lib/session";

/** GET /api/activities - return current user's persisted activities from Supabase */
export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) {
    return NextResponse.json({ activities: [] });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activities")
    .select("id,strava_id,user_strava_id,name,distance,elevation_gain,moving_time,type,date,kudos,detected_zone_id,created_at")
    .eq("user_strava_id", userId)
    .order("date", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Failed to fetch activities:", error);
    return NextResponse.json({ activities: [] });
  }

  return NextResponse.json({ activities: data ?? [] });
}
