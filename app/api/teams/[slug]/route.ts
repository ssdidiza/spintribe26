import { NextRequest, NextResponse } from "next/server";
import { getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

type Context = {
  params: Promise<{ slug: string }>;
};

export async function GET(_req: NextRequest, ctx: Context) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await ctx.params;
  const db = supabaseAdmin();
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(new Date());

  const { data: team, error: teamError } = await db
    .from("teams")
    .select("id,name,slug,logo_url,banner_url,description,created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const [{ data: members, error: membersError }, { data: activities, error: activitiesError }] = await Promise.all([
    db
      .from("users")
      .select("strava_id,name,avatar,role,tier,current_league_name,current_league_threshold,zone")
      .eq("team_id", team.id)
      .eq("onboarded", true)
      .order("name", { ascending: true }),
    db
      .from("activities")
      .select("strava_id,user_strava_id,name,distance,elevation_gain,type,date")
      .gte("date", rangeStart)
      .lt("date", rangeEnd)
      .order("date", { ascending: false }),
  ]);

  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  const memberIds = new Set((members ?? []).map((member) => String(member.strava_id)));
  const teamActivities = (activities ?? []).filter((activity) => memberIds.has(String(activity.user_strava_id)));
  const totalDistanceKm = Math.round(
    teamActivities.reduce((sum, activity) => sum + Number(activity.distance ?? 0), 0) / 1000
  );
  const totalElevation = Math.round(
    teamActivities.reduce((sum, activity) => sum + Number(activity.elevation_gain ?? 0), 0)
  );
  const activeRiders = new Set(teamActivities.map((activity) => String(activity.user_strava_id))).size;
  const averageLeagueLevel = members?.length
    ? Math.round(
        members.reduce((sum, member) => sum + Number(member.current_league_threshold ?? member.tier ?? 200), 0) /
          members.length
      )
    : 0;

  return NextResponse.json({
    team,
    stats: {
      memberCount: members?.length ?? 0,
      averageLeagueLevel,
      totalDistanceKm,
      totalElevation,
      activeRiders,
    },
    members: (members ?? []).map((member) => ({
      id: member.strava_id,
      name: member.name,
      avatar: member.avatar,
      role: member.role,
      leagueName: member.current_league_name ?? `${member.tier} Club`,
      leagueLevel: member.current_league_threshold ?? member.tier,
      zone: member.zone,
    })),
    recentActivities: teamActivities.slice(0, 20).map((activity) => ({
      id: activity.strava_id,
      userId: activity.user_strava_id,
      name: activity.name,
      distanceKm: Math.round(Number(activity.distance ?? 0) / 1000),
      elevationGain: Math.round(Number(activity.elevation_gain ?? 0)),
      type: activity.type,
      date: activity.date,
    })),
  });
}
