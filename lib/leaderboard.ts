import { CHALLENGE_TIERS, getMonthKey } from "./challenge";
import {
  getLeagueByTier,
  getLeagueProgress,
  getMetricValue,
  type LeaderboardMetric,
} from "./leagues";
import type {
  LeaderboardApiResponse,
  LeaderboardEntry,
  Tier,
  User,
  UserRole,
} from "./types";

export type LeaderboardUserRow = {
  strava_id: string | number;
  name: string | null;
  avatar: string | null;
  role: UserRole | null;
  tier: number | null;
  team_id?: string | null;
  teams?: { name?: string | null; slug?: string | null } | { name?: string | null; slug?: string | null }[] | null;
  current_league_id?: string | null;
  current_league_name?: string | null;
  current_league_threshold?: number | null;
  zone: string | null;
  country: string | null;
  onboarded: boolean | null;
  leaderboard_consent: boolean | null;
};

export type LeaderboardActivityRow = {
  user_strava_id: string | number;
  distance: number | string | null;
  elevation_gain?: number | string | null;
  type: string | null;
  date: string | null;
};

type ActivityAggregate = {
  metres: number;
  elevation: number;
  rideDays: Set<string>;
  activityCount: number;
  longestMetres: number;
  lastRideAt?: string;
};

export function getLeaderboardMonthRange(date = new Date()) {
  const rangeStart = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1)).toISOString();

  return { rangeStart, rangeEnd };
}

function toTier(value: number | null | undefined): Tier {
  const tier = Number(value) as Tier;
  return CHALLENGE_TIERS.includes(tier) ? tier : 400;
}

function toRole(value: UserRole | null): UserRole {
  return value === "admin" || value === "champion" || value === "member" ? value : "member";
}

function isCyclingActivity(type: string | null) {
  return type === "Ride" || type === "VirtualRide" || type === "EBikeRide" || type === "Velomobile";
}

function getTeamMeta(row: LeaderboardUserRow) {
  if (Array.isArray(row.teams)) return row.teams[0] ?? null;
  return row.teams ?? null;
}

function sortByMetric(entries: LeaderboardEntry[], metric: LeaderboardMetric) {
  return [...entries].sort((a, b) => {
    const valueDiff = getMetricValue(metric, b) - getMetricValue(metric, a);
    if (valueDiff !== 0) return valueDiff;
    const distanceDiff = b.totalKm - a.totalKm;
    if (distanceDiff !== 0) return distanceDiff;
    return a.user.name.localeCompare(b.user.name);
  });
}

function addMetricRanks(entries: LeaderboardEntry[]) {
  const distance = sortByMetric(entries, "distance");
  const elevation = sortByMetric(entries, "elevation");
  const consistency = sortByMetric(entries, "consistency");
  const rideCount = sortByMetric(entries, "ride_count");
  const longestRide = sortByMetric(entries, "longest_ride");

  const ranks = new Map<string, Partial<LeaderboardEntry>>();
  const applyRank = (
    sorted: LeaderboardEntry[],
    key: keyof Pick<
      LeaderboardEntry,
      "rank" | "rankElevation" | "consistencyRank" | "rankRideCount" | "rankLongestRide"
    >
  ) => {
    sorted.forEach((entry, index) => {
      ranks.set(entry.user.id, {
        ...(ranks.get(entry.user.id) ?? {}),
        [key]: index + 1,
      });
    });
  };

  applyRank(distance, "rank");
  applyRank(elevation, "rankElevation");
  applyRank(consistency, "consistencyRank");
  applyRank(rideCount, "rankRideCount");
  applyRank(longestRide, "rankLongestRide");

  return distance.map((entry) => ({
    ...entry,
    rank: ranks.get(entry.user.id)?.rank ?? entry.rank,
    rankElevation: ranks.get(entry.user.id)?.rankElevation,
    consistencyRank: ranks.get(entry.user.id)?.consistencyRank,
    rankRideCount: ranks.get(entry.user.id)?.rankRideCount,
    rankLongestRide: ranks.get(entry.user.id)?.rankLongestRide,
  }));
}

export function buildLeaderboardTiers(
  users: LeaderboardUserRow[],
  activities: LeaderboardActivityRow[]
): LeaderboardApiResponse["tiers"] {
  const statsByUser = new Map<string, ActivityAggregate>();
  for (const activity of activities) {
    if (!isCyclingActivity(activity.type)) continue;
    const stravaId = String(activity.user_strava_id);
    const distance = Number(activity.distance ?? 0);
    const current = statsByUser.get(stravaId) ?? {
      metres: 0,
      elevation: 0,
      rideDays: new Set<string>(),
      activityCount: 0,
      longestMetres: 0,
    };
    current.metres += distance;
    current.elevation += Number(activity.elevation_gain ?? 0);
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

  for (const row of users) {
    if (row.onboarded !== true || row.leaderboard_consent !== true) continue;

    const tier = toTier(row.current_league_threshold ?? row.tier);
    const league = getLeagueByTier(tier);
    const team = getTeamMeta(row);
    const stravaId = String(row.strava_id);
    const name = row.name?.trim() || "SpinTribe rider";
    const stats = statsByUser.get(stravaId);
    const totalKm = Math.round((stats?.metres ?? 0) / 1000);
    const leagueProgress = getLeagueProgress(totalKm, tier);
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
      teamId: row.team_id ?? undefined,
      teamName: team?.name ?? undefined,
      teamSlug: team?.slug ?? undefined,
      currentLeagueId: row.current_league_id ?? undefined,
      currentLeagueName: row.current_league_name ?? league.name,
      currentLeagueThreshold: tier,
    };

    entriesByTier.get(tier)?.push({
      user,
      totalKm,
      totalElevation: Math.round(stats?.elevation ?? 0),
      targetKm: leagueProgress.promotionTargetKm,
      promotionTargetKm: leagueProgress.promotionTargetKm,
      leagueName: row.current_league_name ?? league.name,
      progressPct: leagueProgress.progressPct,
      rank: 0,
      activityCount: stats?.activityCount ?? 0,
      rideDays: stats?.rideDays.size ?? 0,
      longestRideKm: Math.round((stats?.longestMetres ?? 0) / 1000),
      averageRideKm: stats?.activityCount
        ? Math.round((stats.metres / 1000) / stats.activityCount)
        : 0,
      lastRideAt: stats?.lastRideAt,
    });
  }

  const tiers: LeaderboardApiResponse["tiers"] = {};
  for (const tier of CHALLENGE_TIERS) {
    const entries = addMetricRanks(entriesByTier.get(tier) ?? []);
    tiers[String(tier)] = {
      tier,
      count: entries.length,
      entries,
    };
  }

  return tiers;
}

export function buildLeaderboardResponse(
  users: LeaderboardUserRow[],
  activities: LeaderboardActivityRow[],
  date = new Date()
): LeaderboardApiResponse {
  return {
    monthKey: getMonthKey(date),
    generatedAt: new Date().toISOString(),
    tiers: buildLeaderboardTiers(users, activities),
  };
}

export function findLeaderboardEntry(
  tiers: LeaderboardApiResponse["tiers"],
  userId: string
): LeaderboardEntry | undefined {
  for (const tier of CHALLENGE_TIERS) {
    const entry = tiers[String(tier)]?.entries.find((row) => row.user.id === userId);
    if (entry) return entry;
  }
  return undefined;
}
