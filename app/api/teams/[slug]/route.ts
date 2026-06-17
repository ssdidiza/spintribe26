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
      .eq("leaderboard_consent", true)
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

  // Privacy-first: the viewer's OWN contribution only. We never return another
  // rider's individual ride titles, dates, distance, or elevation — Strava data
  // for rider A may not be displayed to rider B. Only team aggregates are shared.
  const yourContributionKm = Math.round(
    teamActivities
      .filter((activity) => String(activity.user_strava_id) === userId)
      .reduce((sum, activity) => sum + Number(activity.distance ?? 0), 0) / 1000
  );

  return NextResponse.json({
    team,
    stats: {
      memberCount: members?.length ?? 0,
      averageLeagueLevel,
      totalDistanceKm,
      totalElevation,
      activeRiders,
      yourContributionKm,
      viewerIsMember: memberIds.has(userId),
    },
    // Privacy-first: the viewer sees their own row in full; other members are
    // de-identified (no name/avatar/zone), keeping only their league band.
    members: (members ?? []).map((member, index) => {
      const isViewer = String(member.strava_id) === userId;
      return {
        id: isViewer ? String(member.strava_id) : `rider-${index}`,
        name: isViewer ? (member.name ?? "You") : "Rider",
        avatar: isViewer ? member.avatar : null,
        role: member.role,
        leagueName: member.current_league_name ?? `${member.tier} Club`,
        leagueLevel: member.current_league_threshold ?? member.tier,
        zone: isViewer ? member.zone : null,
        isViewer,
      };
    }),
  });
}
