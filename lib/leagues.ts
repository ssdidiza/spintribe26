import type { Tier } from "./types";

export type LeaderboardMetric =
  | "distance"
  | "elevation"
  | "consistency"
  | "ride_count"
  | "longest_ride";

export interface LeagueDefinition {
  tier: Tier;
  name: string;
  minKm: number;
  maxKm: number | null;
  accent: string;
  description: string;
}

export const LEAGUES: LeagueDefinition[] = [
  {
    tier: 200,
    name: "200 Club",
    minKm: 0,
    maxKm: 299,
    accent: "#b8b8b8",
    description: "The entry league for riders building a monthly habit.",
  },
  {
    tier: 400,
    name: "400 Club",
    minKm: 300,
    maxKm: 499,
    accent: "#ffffff",
    description: "Consistent riders turning regular training into momentum.",
  },
  {
    tier: 600,
    name: "600 Club",
    minKm: 500,
    maxKm: 799,
    accent: "#ffb1c1",
    description: "Committed riders with promotion clearly in sight.",
  },
  {
    tier: 800,
    name: "800 Club",
    minKm: 800,
    maxKm: 1199,
    accent: "#ff7a2f",
    description: "Serious riders carrying big monthly volume.",
  },
  {
    tier: 1000,
    name: "1000 Club",
    minKm: 1200,
    maxKm: null,
    accent: "#ff4b35",
    description: "The open-ended stretch league for the biggest months.",
  },
];

export const LEAGUE_METRICS: { id: LeaderboardMetric; label: string; shortLabel: string }[] = [
  { id: "distance", label: "Distance", shortLabel: "km" },
  { id: "elevation", label: "Elevation", shortLabel: "m" },
  { id: "consistency", label: "Consistency", shortLabel: "days" },
  { id: "ride_count", label: "Ride Count", shortLabel: "rides" },
  { id: "longest_ride", label: "Longest Ride", shortLabel: "km" },
];

export function getLeagueByTier(tier: number | null | undefined): LeagueDefinition {
  return LEAGUES.find((league) => league.tier === Number(tier)) ?? LEAGUES[1];
}

export function getLeagueForDistanceKm(km: number): LeagueDefinition {
  return LEAGUES.find((league) => {
    const lowerBound = km >= league.minKm;
    const upperBound = league.maxKm === null || km <= league.maxKm;
    return lowerBound && upperBound;
  }) ?? LEAGUES[LEAGUES.length - 1];
}

export function getNextLeague(tier: number | null | undefined): LeagueDefinition | null {
  const index = LEAGUES.findIndex((league) => league.tier === Number(tier));
  return index >= 0 ? LEAGUES[index + 1] ?? null : null;
}

export function getPreviousLeague(tier: number | null | undefined): LeagueDefinition | null {
  const index = LEAGUES.findIndex((league) => league.tier === Number(tier));
  return index > 0 ? LEAGUES[index - 1] ?? null : null;
}

export function getPromotionTargetKm(tier: number | null | undefined): number {
  const next = getNextLeague(tier);
  if (next) return next.minKm;
  return getLeagueByTier(tier).minKm;
}

export function getLeagueProgress(monthlyKm: number, tier: number | null | undefined) {
  const league = getLeagueByTier(tier);
  const nextLeague = getNextLeague(tier);
  const promotionTargetKm = getPromotionTargetKm(tier);
  const remainingKm = Math.max(0, promotionTargetKm - monthlyKm);
  const progressPct = promotionTargetKm > 0
    ? Math.min(100, Math.round((monthlyKm / promotionTargetKm) * 100))
    : 100;

  return {
    league,
    nextLeague,
    promotionTargetKm,
    remainingKm,
    progressPct,
    isPromotionReady: nextLeague ? monthlyKm >= promotionTargetKm : monthlyKm >= league.minKm,
  };
}

export function formatLeagueRange(league: LeagueDefinition) {
  return league.maxKm === null
    ? `${league.minKm}+ km`
    : `${league.minKm}-${league.maxKm} km`;
}

export function getMetricValue(
  metric: LeaderboardMetric,
  entry: {
    totalKm: number;
    totalElevation?: number;
    rideDays?: number;
    activityCount?: number;
    longestRideKm?: number;
  }
) {
  switch (metric) {
    case "elevation":
      return Math.round(entry.totalElevation ?? 0);
    case "consistency":
      return entry.rideDays ?? 0;
    case "ride_count":
      return entry.activityCount ?? 0;
    case "longest_ride":
      return entry.longestRideKm ?? 0;
    case "distance":
    default:
      return entry.totalKm;
  }
}

export function getMetricRankKey(metric: LeaderboardMetric) {
  switch (metric) {
    case "elevation":
      return "rankElevation";
    case "consistency":
      return "consistencyRank";
    case "ride_count":
      return "rankRideCount";
    case "longest_ride":
      return "rankLongestRide";
    case "distance":
    default:
      return "rank";
  }
}
