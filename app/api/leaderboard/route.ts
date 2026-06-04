import { NextResponse } from "next/server";
import { CHALLENGE_TIERS, getMonthKey } from "@/lib/challenge";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { LeaderboardApiResponse, LeaderboardEntry, Tier, User, UserRole } from "@/lib/types";

type LeaderboardUserRow = {
  strava_id: string | number;
  name: string | null;
  avatar: string | null;
  role: UserRole | null;
  tier: number | null;
  zone: string | null;
  country: string | null;
  onboarded: boolean | null;
  leaderboard_consent: boolean | null;
};

type ActivityRow = {
  user_strava_id: string | number;
  distance: number | null;
  type: string | null;
  date: string | null;
};

type ActivityAggregate = {
  metres: number;
  rideDays: Set<string>;
  activityCount: number;
  longestMetres: number;
  lastRideAt?: string;
};

function toTier(value: number | null): Tier {
  const tier = Number(value) as Tier;
  return CHALLENGE_TIERS.includes(tier) ? tier : 400;
}

function toRole(value: UserRole | null): UserRole {
  return value === "admin" || value === "champion" || value === "member" ? value : "member";
}

function rankEntries(entries: LeaderboardEntry[]) {
  return entries
    .sort((a, b) => b.totalKm - a.totalKm || a.user.name.localeCompare(b.user.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function addConsistencyRanks(entries: LeaderboardEntry[]) {
  const consistencyRanks = new Map(
    [...entries]
      .sort((a, b) =>
        (b.rideDays ?? 0) - (a.rideDays ?? 0) ||
        b.totalKm - a.totalKm ||
        a.user.name.localeCompare(b.user.name)
      )
      .map((entry, index) => [entry.user.id, index + 1])
  );

  return entries.map((entry) => ({
    ...entry,
    consistencyRank: consistencyRanks.get(entry.user.id) ?? entry.rank,
  }));
}

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();
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

  const statsByUser = new Map<string, ActivityAggregate>();
  for (const activity of (activities ?? []) as ActivityRow[]) {
    if (activity.type !== "Ride" && activity.type !== "VirtualRide") continue;
    const stravaId = String(activity.user_strava_id);
    const distance = Number(activity.distance ?? 0);
    const current = statsByUser.get(stravaId) ?? {
      metres: 0,
      rideDays: new Set<string>(),
      activityCount: 0,
      longestMetres: 0,
    };
    current.metres += distance;
    current.activityCount += 1;
    current.longestMetres = Math.max(current.longestMetres, distance);
    if (activity.date) {
      current.rideDays.add(new Date(activity.date).toISOString().slice(0, 10));
      if (!current.lastRideAt || new Date(activity.date).getTime() > new Date(current.lastRideAt).getTime()) {
        current.lastRideAt = activity.date;
      }
    }
    statsByUser.set(stravaId, current);
  }

  const entriesByTier = new Map<Tier, LeaderboardEntry[]>(
    CHALLENGE_TIERS.map((tier) => [tier, []])
  );

  for (const row of (users ?? []) as LeaderboardUserRow[]) {
    const tier = toTier(row.tier);
    const stravaId = String(row.strava_id);
    const name = row.name?.trim() || "Team Vitality rider";
    const stats = statsByUser.get(stravaId);
    const totalKm = Math.round((stats?.metres ?? 0) / 1000);
    const user: User = {
      id: stravaId,
      stravaId,
      name,
      avatar: row.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      role: toRole(row.role),
      tier,
      isConnected: true,
      zone: row.zone ?? undefined,
      region: row.zone ?? undefined,
      country: row.country ?? undefined,
      onboarded: row.onboarded === true,
      leaderboardConsent: row.leaderboard_consent === true,
    };

    entriesByTier.get(tier)?.push({
      user,
      totalKm,
      targetKm: tier,
      progressPct: Math.min(100, Math.round((totalKm / tier) * 100)),
      rank: 0,
      activityCount: stats?.activityCount ?? 0,
      rideDays: stats?.rideDays.size ?? 0,
      longestRideKm: Math.round((stats?.longestMetres ?? 0) / 1000),
      averageRideKm: stats?.activityCount
        ? Math.round(((stats.metres / 1000) / stats.activityCount))
        : 0,
      lastRideAt: stats?.lastRideAt,
    });
  }

  const tiers: LeaderboardApiResponse["tiers"] = {};
  for (const tier of CHALLENGE_TIERS) {
    const entries = addConsistencyRanks(rankEntries(entriesByTier.get(tier) ?? []));
    tiers[String(tier)] = {
      tier,
      count: entries.length,
      entries,
    };
  }

  return NextResponse.json({
    monthKey: getMonthKey(now),
    generatedAt: now.toISOString(),
    tiers,
  } satisfies LeaderboardApiResponse);
}
