import { NextRequest, NextResponse } from "next/server";
import { CHALLENGE_TIERS, getMonthKey } from "@/lib/challenge";
import { getLeagueByTier, getLeagueProgress } from "@/lib/leagues";
import { buildLeaderboardResponse, getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import type { LeaderboardApiResponse, LeaderboardEntry, Tier, User, UserRole } from "@/lib/types";

type HistoricalStandingRow = {
  user_strava_id: string;
  month_key: string;
  total_km: number | string;
  total_elevation: number | string;
  ride_count: number | string;
  active_days: number | string;
  longest_ride_km: number | string;
  rank_distance: number | null;
  rank_elevation: number | null;
  rank_consistency: number | null;
  rank_ride_count: number | null;
  rank_longest_ride: number | null;
  leagues?: { name?: string | null; min_km?: number | null; max_km?: number | null } | null;
  users?: {
    strava_id?: string | number | null;
    name?: string | null;
    avatar?: string | null;
    role?: UserRole | null;
    tier?: number | null;
    team_id?: string | null;
    current_league_name?: string | null;
    current_league_threshold?: number | null;
    zone?: string | null;
    country?: string | null;
    onboarded?: boolean | null;
    leaderboard_consent?: boolean | null;
    teams?: { name?: string | null; slug?: string | null } | null;
  } | null;
};

function parseLeagueTier(name: string | null | undefined, fallback?: number | null): Tier {
  const parsed = Number((name ?? "").match(/\d+/)?.[0] ?? fallback ?? 400) as Tier;
  return CHALLENGE_TIERS.includes(parsed) ? parsed : 400;
}

function buildHistoricalResponse(rows: HistoricalStandingRow[], monthKey: string): LeaderboardApiResponse {
  const grouped = new Map<Tier, LeaderboardEntry[]>(
    CHALLENGE_TIERS.map((tier) => [tier, []])
  );

  for (const row of rows) {
    if (row.users?.leaderboard_consent === false || row.users?.onboarded === false) continue;
    const tier = parseLeagueTier(row.leagues?.name, row.users?.current_league_threshold ?? row.users?.tier);
    const league = getLeagueByTier(tier);
    const name = row.users?.name?.trim() || "SpinTribe rider";
    const totalKm = Math.round(Number(row.total_km ?? 0));
    const progress = getLeagueProgress(totalKm, tier);
    const user: User = {
      id: String(row.users?.strava_id ?? row.user_strava_id),
      stravaId: String(row.users?.strava_id ?? row.user_strava_id),
      name,
      avatar: row.users?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      role: row.users?.role ?? "member",
      tier,
      isConnected: true,
      zone: row.users?.zone ?? undefined,
      region: row.users?.zone ?? undefined,
      country: row.users?.country ?? undefined,
      onboarded: row.users?.onboarded === true,
      leaderboardConsent: row.users?.leaderboard_consent ?? true,
      teamId: row.users?.team_id ?? undefined,
      teamName: row.users?.teams?.name ?? undefined,
      teamSlug: row.users?.teams?.slug ?? undefined,
      currentLeagueName: row.leagues?.name ?? league.name,
      currentLeagueThreshold: tier,
    };

    grouped.get(tier)?.push({
      user,
      totalKm,
      totalElevation: Math.round(Number(row.total_elevation ?? 0)),
      targetKm: progress.promotionTargetKm,
      promotionTargetKm: progress.promotionTargetKm,
      leagueName: row.leagues?.name ?? league.name,
      progressPct: progress.progressPct,
      rank: row.rank_distance ?? 0,
      rankElevation: row.rank_elevation ?? undefined,
      consistencyRank: row.rank_consistency ?? undefined,
      rankRideCount: row.rank_ride_count ?? undefined,
      rankLongestRide: row.rank_longest_ride ?? undefined,
      activityCount: Number(row.ride_count ?? 0),
      rideDays: Number(row.active_days ?? 0),
      longestRideKm: Math.round(Number(row.longest_ride_km ?? 0)),
      averageRideKm: Number(row.ride_count ?? 0) > 0
        ? Math.round(totalKm / Number(row.ride_count))
        : 0,
    });
  }

  const tiers: LeaderboardApiResponse["tiers"] = {};
  for (const tier of CHALLENGE_TIERS) {
    const entries = (grouped.get(tier) ?? []).sort((a, b) => a.rank - b.rank);
    tiers[String(tier)] = { tier, count: entries.length, entries };
  }

  return {
    monthKey,
    generatedAt: new Date().toISOString(),
    tiers,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const requestedMonth = req.nextUrl.searchParams.get("month");
  const currentMonth = getMonthKey(now);
  const db = supabaseAdmin();

  if (requestedMonth && requestedMonth !== currentMonth) {
    const { data, error } = await db
      .from("monthly_league_standings")
      .select("user_strava_id,month_key,total_km,total_elevation,ride_count,active_days,longest_ride_km,rank_distance,rank_elevation,rank_consistency,rank_ride_count,rank_longest_ride,leagues(name,min_km,max_km),users(strava_id,name,avatar,role,tier,team_id,current_league_name,current_league_threshold,zone,country,onboarded,leaderboard_consent,teams(name,slug))")
      .eq("month_key", requestedMonth);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(buildHistoricalResponse((data ?? []) as HistoricalStandingRow[], requestedMonth));
  }

  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(now);

  const { data: users, error: usersError } = await db
    .from("users")
    .select("strava_id,name,avatar,role,tier,team_id,current_league_id,current_league_name,current_league_threshold,zone,country,onboarded,leaderboard_consent,teams(name,slug)")
    .eq("onboarded", true)
    .eq("leaderboard_consent", true);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const { data: activities, error: activitiesError } = await db
    .from("activities")
    .select("user_strava_id,distance,elevation_gain,type,date")
    .gte("date", rangeStart)
    .lt("date", rangeEnd);

  if (activitiesError) {
    return NextResponse.json({ error: activitiesError.message }, { status: 500 });
  }

  return NextResponse.json(buildLeaderboardResponse(users ?? [], activities ?? [], now));
}
