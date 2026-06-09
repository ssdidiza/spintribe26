import { NextResponse } from "next/server";
import { buildLeaderboardResponse, getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(now);
  const db = supabaseAdmin();

  const { data: users, error: usersError } = await db
    .from("users")
    .select("strava_id,name,avatar,role,tier,zone,country,onboarded,leaderboard_consent")
    .eq("onboarded", true)
    .eq("leaderboard_consent", true);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const { data: activities, error: activitiesError } = await db
    .from("activities")
    .select("user_strava_id,distance,type,date")
    .gte("date", rangeStart)
    .lt("date", rangeEnd);

  if (activitiesError) {
    return NextResponse.json({ error: activitiesError.message }, { status: 500 });
  }

  return NextResponse.json(buildLeaderboardResponse(users ?? [], activities ?? [], now));
}
