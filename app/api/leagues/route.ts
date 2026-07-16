import { NextResponse } from "next/server";
import { getMonthKey } from "@/lib/challenge";
import { LEAGUES, getLeagueByTier, getLeagueForDistanceKm, getLeagueProgress } from "@/lib/leagues";
import { buildLeaderboardResponse, findLeaderboardEntry, getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getSession, getStravaUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  const userId = getStravaUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const db = supabaseAdmin();
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(now);

  const [
    userResult,
    activitiesResult,
    usersResult,
    allActivitiesResult,
    membershipsResult,
    promotionEventsResult,
  ] = await Promise.all([
    db
      .from("users")
      .select("strava_id,name,tier,current_league_id,current_league_name,current_league_threshold")
      .eq("strava_id", userId)
      .maybeSingle(),
    db
      .from("activities")
      .select("distance,elevation_gain,type,date")
      .eq("user_strava_id", userId)
      .gte("date", rangeStart)
      .lt("date", rangeEnd),
    db
      .from("users")
      // FK hint required: users<->teams has two relationships (team_id, created_by).
      .select("strava_id,name,avatar,role,tier,team_id,current_league_id,current_league_name,current_league_threshold,zone,country,onboarded,leaderboard_consent,teams!users_team_id_fkey(name,slug)")
      .eq("onboarded", true)
      .eq("leaderboard_consent", true),
    db
      .from("activities")
      .select("user_strava_id,distance,elevation_gain,type,date")
      .gte("date", rangeStart)
      .lt("date", rangeEnd),
    db
      .from("league_memberships")
      // FK hint required: league_memberships has three FKs to leagues
      // (league_id, promoted_from_league_id, relegated_from_league_id).
      .select("month_key,assigned_km,assigned_league_name,assigned_league_threshold,promoted_from_league_id,relegated_from_league_id,leagues!league_memberships_league_id_fkey(name,min_km,max_km)")
      .eq("user_strava_id", userId)
      .order("month_key", { ascending: true })
      .limit(12),
    db
      .from("league_promotion_events")
      .select("month_key,from_league_name,to_league_name,to_league_threshold,kind,km_at_promotion,created_at")
      .eq("user_strava_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (userResult.error) return NextResponse.json({ error: userResult.error.message }, { status: 500 });
  if (activitiesResult.error) return NextResponse.json({ error: activitiesResult.error.message }, { status: 500 });
  if (usersResult.error) return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
  if (allActivitiesResult.error) return NextResponse.json({ error: allActivitiesResult.error.message }, { status: 500 });
  if (membershipsResult.error) return NextResponse.json({ error: membershipsResult.error.message }, { status: 500 });
  // Soft-fail: if league_promotion_events isn't migrated yet, degrade to an
  // empty promotion journey instead of 500-ing the whole league surface.
  const promotionEventRows = promotionEventsResult.error ? [] : (promotionEventsResult.data ?? []);

  const monthlyKm = Math.round(
    (activitiesResult.data ?? [])
      .filter((activity) => activity.type === "Ride" || activity.type === "VirtualRide" || activity.type === "EBikeRide" || activity.type === "Velomobile")
      .reduce((sum, activity) => sum + Number(activity.distance ?? 0), 0) / 1000
  );
  const totalElevation = Math.round(
    (activitiesResult.data ?? []).reduce((sum, activity) => sum + Number(activity.elevation_gain ?? 0), 0)
  );

  const currentTier = Number(
    userResult.data?.current_league_threshold ?? userResult.data?.tier ?? getLeagueForDistanceKm(monthlyKm).tier
  );
  const currentLeague = getLeagueByTier(currentTier);
  const progress = getLeagueProgress(monthlyKm, currentTier);
  const leaderboard = buildLeaderboardResponse(usersResult.data ?? [], allActivitiesResult.data ?? [], now);
  const currentEntry = findLeaderboardEntry(leaderboard.tiers, userId);

  // Promotion journey (fast-track in-month + month-end), grouped by month, for
  // the Profile "League Journey" and the fast-track badge in League Status.
  const currentMonth = getMonthKey(now);
  const promotionsByMonth = new Map<
    string,
    { toName: string; toThreshold: number; fromName: string | null; kind: string }[]
  >();
  for (const event of promotionEventRows) {
    const list = promotionsByMonth.get(event.month_key) ?? [];
    list.push({
      toName: event.to_league_name,
      toThreshold: Number(event.to_league_threshold),
      fromName: event.from_league_name ?? null,
      kind: event.kind,
    });
    promotionsByMonth.set(event.month_key, list);
  }
  const currentMonthPromotions = promotionsByMonth.get(currentMonth) ?? [];
  const fastTrackedThisMonth = currentMonthPromotions.some((p) => p.kind === "fast_track");

  return NextResponse.json({
    monthKey: getMonthKey(now),
    leagues: LEAGUES,
    current: {
      userId,
      monthlyKm,
      totalElevation,
      league: {
        ...currentLeague,
        name: userResult.data?.current_league_name ?? currentLeague.name,
      },
      leagueMinKm: currentLeague.minKm,
      nextLeague: progress.nextLeague,
      promotionTargetKm: progress.promotionTargetKm,
      remainingKm: progress.remainingKm,
      progressPct: progress.progressPct,
      fastTrackedThisMonth,
      promotions: currentMonthPromotions,
      rankDistance: currentEntry?.rank ?? null,
      rankElevation: currentEntry?.rankElevation ?? null,
      rankConsistency: currentEntry?.consistencyRank ?? null,
      rankRideCount: currentEntry?.rankRideCount ?? null,
      rankLongestRide: currentEntry?.rankLongestRide ?? null,
      leagueRiders: leaderboard.tiers[String(currentTier)]?.count ?? 0,
    },
    history: (membershipsResult.data ?? []).map((row) => ({
      monthKey: row.month_key,
      assignedKm: row.assigned_km,
      leagueName: row.assigned_league_name,
      leagueThreshold: row.assigned_league_threshold,
      promoted: !!row.promoted_from_league_id,
      relegated: !!row.relegated_from_league_id,
      promotions: promotionsByMonth.get(row.month_key) ?? [],
    })),
  });
}
