import { NextRequest, NextResponse } from "next/server";
import { LEAGUES, getLeagueForDistanceKm } from "@/lib/leagues";
import { supabaseAdmin } from "@/lib/supabase";
import type { Tier } from "@/lib/types";

type ActivityRow = {
  user_strava_id: string;
  distance: number | string | null;
  elevation_gain: number | string | null;
  type: string | null;
  date: string | null;
};

type UserRow = {
  strava_id: string;
  current_league_threshold: number | null;
};

type Aggregate = {
  userId: string;
  totalKm: number;
  totalElevation: number;
  rideCount: number;
  activeDays: number;
  longestRideKm: number;
  leagueTier: Tier;
  ranks: {
    distance?: number;
    elevation?: number;
    consistency?: number;
    rideCount?: number;
    longestRide?: number;
  };
};

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isCycling(type: string | null) {
  return type === "Ride" || type === "VirtualRide" || type === "EBikeRide" || type === "Velomobile";
}

function verifyCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? process.env.LEAGUE_JOB_SECRET;
  if (!expected && process.env.NODE_ENV === "production") return false;
  if (!expected) return true;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${expected}` || headerSecret === expected;
}

function rankWithinLeague(
  aggregates: Aggregate[],
  metric: "distance" | "elevation" | "consistency" | "rideCount" | "longestRide"
) {
  const valueFor = (aggregate: Aggregate) => {
    switch (metric) {
      case "elevation":
        return aggregate.totalElevation;
      case "consistency":
        return aggregate.activeDays;
      case "rideCount":
        return aggregate.rideCount;
      case "longestRide":
        return aggregate.longestRideKm;
      case "distance":
      default:
        return aggregate.totalKm;
    }
  };

  for (const league of LEAGUES) {
    aggregates
      .filter((aggregate) => aggregate.leagueTier === league.tier)
      .sort((a, b) => valueFor(b) - valueFor(a) || b.totalKm - a.totalKm || a.userId.localeCompare(b.userId))
      .forEach((aggregate, index) => {
        aggregate.ranks[metric] = index + 1;
      });
  }
}

// Vercel cron jobs invoke their endpoint with GET (Authorization: Bearer CRON_SECRET).
// Manual/admin invocations may use POST with the same secret.
export async function GET(req: NextRequest) {
  return runMonthlyAssignment(req);
}

export async function POST(req: NextRequest) {
  return runMonthlyAssignment(req);
}

async function runMonthlyAssignment(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonth = monthKey(currentMonthStart);
  const previousMonth = monthKey(previousMonthStart);
  const currentMonthEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const { error: leagueUpsertError } = await db.from("leagues").upsert(
    LEAGUES.map((league) => ({
      name: league.name,
      min_km: league.minKm,
      max_km: league.maxKm,
    })),
    { onConflict: "name" }
  );
  if (leagueUpsertError) return NextResponse.json({ error: leagueUpsertError.message }, { status: 500 });

  const { data: leagueRows, error: leaguesError } = await db
    .from("leagues")
    .select("id,name,min_km,max_km");
  if (leaguesError) return NextResponse.json({ error: leaguesError.message }, { status: 500 });

  const leagueByTier = new Map(
    (leagueRows ?? []).map((row) => [Number(String(row.name).match(/\d+/)?.[0] ?? 200), row])
  );

  const [{ data: users, error: usersError }, { data: activities, error: activitiesError }, { data: previousMemberships, error: previousMembershipsError }] = await Promise.all([
    db.from("users").select("strava_id,current_league_threshold").eq("onboarded", true),
    db
      .from("activities")
      .select("user_strava_id,distance,elevation_gain,type,date")
      .gte("date", previousMonthStart.toISOString())
      .lt("date", previousMonthEnd.toISOString()),
    db
      .from("league_memberships")
      .select("user_strava_id,assigned_league_threshold,month_key,league_id")
      .lt("month_key", currentMonth)
      .order("month_key", { ascending: false }),
  ]);

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });
  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });
  if (previousMembershipsError) return NextResponse.json({ error: previousMembershipsError.message }, { status: 500 });

  const rawByUser = new Map<string, {
    metres: number;
    elevation: number;
    rideCount: number;
    activeDays: Set<string>;
    longestMetres: number;
  }>();

  for (const activity of (activities ?? []) as ActivityRow[]) {
    if (!isCycling(activity.type)) continue;
    const userId = String(activity.user_strava_id);
    const current = rawByUser.get(userId) ?? {
      metres: 0,
      elevation: 0,
      rideCount: 0,
      activeDays: new Set<string>(),
      longestMetres: 0,
    };
    const distance = Number(activity.distance ?? 0);
    current.metres += distance;
    current.elevation += Number(activity.elevation_gain ?? 0);
    current.rideCount += 1;
    current.longestMetres = Math.max(current.longestMetres, distance);
    if (activity.date) current.activeDays.add(new Date(activity.date).toISOString().slice(0, 10));
    rawByUser.set(userId, current);
  }

  const aggregates: Aggregate[] = ((users ?? []) as UserRow[]).map((user) => {
    const stats = rawByUser.get(String(user.strava_id));
    const totalKm = Math.round((stats?.metres ?? 0) / 1000);
    const league = getLeagueForDistanceKm(totalKm);
    return {
      userId: String(user.strava_id),
      totalKm,
      totalElevation: Math.round(stats?.elevation ?? 0),
      rideCount: stats?.rideCount ?? 0,
      activeDays: stats?.activeDays.size ?? 0,
      longestRideKm: Math.round((stats?.longestMetres ?? 0) / 1000),
      leagueTier: league.tier,
      ranks: {},
    };
  });

  rankWithinLeague(aggregates, "distance");
  rankWithinLeague(aggregates, "elevation");
  rankWithinLeague(aggregates, "consistency");
  rankWithinLeague(aggregates, "rideCount");
  rankWithinLeague(aggregates, "longestRide");

  const previousByUser = new Map<string, { assigned_league_threshold: number; league_id: string }>();
  for (const membership of previousMemberships ?? []) {
    const userId = String(membership.user_strava_id);
    if (!previousByUser.has(userId)) {
      previousByUser.set(userId, {
        assigned_league_threshold: Number(membership.assigned_league_threshold),
        league_id: String(membership.league_id),
      });
    }
  }

  const standingsRows = [];
  const membershipRows = [];
  for (const aggregate of aggregates) {
    const leagueDefinition = getLeagueForDistanceKm(aggregate.totalKm);
    const leagueRow = leagueByTier.get(leagueDefinition.tier);
    if (!leagueRow) continue;
    const previous = previousByUser.get(aggregate.userId);
    const promoted = previous && aggregate.leagueTier > previous.assigned_league_threshold ? previous.league_id : null;
    const relegated = previous && aggregate.leagueTier < previous.assigned_league_threshold ? previous.league_id : null;

    standingsRows.push({
      user_strava_id: aggregate.userId,
      league_id: leagueRow.id,
      month_key: previousMonth,
      total_km: aggregate.totalKm,
      total_elevation: aggregate.totalElevation,
      ride_count: aggregate.rideCount,
      active_days: aggregate.activeDays,
      longest_ride_km: aggregate.longestRideKm,
      rank_distance: aggregate.ranks.distance ?? null,
      rank_elevation: aggregate.ranks.elevation ?? null,
      rank_consistency: aggregate.ranks.consistency ?? null,
      rank_ride_count: aggregate.ranks.rideCount ?? null,
      rank_longest_ride: aggregate.ranks.longestRide ?? null,
    });

    membershipRows.push({
      user_strava_id: aggregate.userId,
      league_id: leagueRow.id,
      month_key: currentMonth,
      start_date: currentMonthStart.toISOString().slice(0, 10),
      end_date: currentMonthEndDate,
      assigned_km: aggregate.totalKm,
      assigned_league_name: leagueDefinition.name,
      assigned_league_threshold: leagueDefinition.tier,
      promoted_from_league_id: promoted,
      relegated_from_league_id: relegated,
    });
  }

  if (standingsRows.length > 0) {
    const { error } = await db
      .from("monthly_league_standings")
      .upsert(standingsRows, {
        onConflict: "user_strava_id,league_id,month_key",
        ignoreDuplicates: true,
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (membershipRows.length > 0) {
    const { error } = await db
      .from("league_memberships")
      .upsert(membershipRows, {
        onConflict: "user_strava_id,month_key",
        ignoreDuplicates: true,
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const aggregate of aggregates) {
    const leagueDefinition = getLeagueForDistanceKm(aggregate.totalKm);
    const leagueRow = leagueByTier.get(leagueDefinition.tier);
    if (!leagueRow) continue;
    const { error } = await db
      .from("users")
      .update({
        tier: leagueDefinition.tier,
        current_league_id: leagueRow.id,
        current_league_name: leagueDefinition.name,
        current_league_threshold: leagueDefinition.tier,
        updated_at: new Date().toISOString(),
      })
      .eq("strava_id", aggregate.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    previousMonth,
    currentMonth,
    usersProcessed: aggregates.length,
    standingsInserted: standingsRows.length,
    membershipsInserted: membershipRows.length,
  });
}
