import { CHALLENGE_TIERS, getMonthKey } from "./challenge";
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
  zone: string | null;
  country: string | null;
  onboarded: boolean | null;
  leaderboard_consent: boolean | null;
};

export type LeaderboardActivityRow = {
  user_strava_id: string | number;
  distance: number | string | null;
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

export function getLeaderboardMonthRange(date = new Date()) {
  const rangeStart = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1)).toISOString();

  return { rangeStart, rangeEnd };
}

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

export function buildLeaderboardTiers(
  users: LeaderboardUserRow[],
  activities: LeaderboardActivityRow[]
): LeaderboardApiResponse["tiers"] {
  const statsByUser = new Map<string, ActivityAggregate>();
  for (const activity of activities) {
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

  for (const row of users) {
    if (row.onboarded !== true || row.leaderboard_consent !== true) continue;

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
        ? Math.round((stats.metres / 1000) / stats.activityCount)
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
