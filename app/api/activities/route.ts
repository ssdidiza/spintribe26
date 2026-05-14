import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

/** GET /api/activities — return current user's persisted activities from Supabase */
export async function GET() {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ activities: [] });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activities")
    .select("*")
    .eq("user_strava_id", String(session.athleteId))
    .order("date", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to fetch activities:", error);
    return NextResponse.json({ activities: [] });
  }

  return NextResponse.json({ activities: data ?? [] });
}
