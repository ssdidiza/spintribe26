import { Activity, Tier, User } from "./types";

export const CHALLENGE_TIERS: Tier[] = [200, 400, 600, 800, 1000];
export const OFFICIAL_REWARD_TIERS: Tier[] = [200, 400, 600, 800];

export const NEXT_TIER: Partial<Record<Tier, Tier>> = {
  200: 400,
  400: 600,
  600: 800,
  800: 1000,
};

export function isOfficialRewardTier(tier: Tier) {
  return OFFICIAL_REWARD_TIERS.includes(tier);
}

export function getNextTier(tier: Tier): Tier | null {
  return NEXT_TIER[tier] ?? null;
}

export function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getNextMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function isActivityInMonth(activityDate: string, date = new Date()) {
  const d = new Date(activityDate);
  return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
}

export function getMonthlyActivities(
  userId: string,
  activities: Activity[],
  date = new Date()
) {
  return activities.filter((activity) => (
    activity.userId === userId && isActivityInMonth(activity.date, date)
  ));
}

export function getMonthlyKmForActivities(activities: Activity[]) {
  return Math.round(activities.reduce((sum, activity) => sum + activity.distance, 0) / 1000);
}

export function getMonthlyKmForUser(userId: string, activities: Activity[], date = new Date()) {
  return getMonthlyKmForActivities(getMonthlyActivities(userId, activities, date));
}

function getLocalDateKey(value: string) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getLocalWeekKey(value: string) {
  const date = new Date(value);
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const week = Math.floor((date.getDate() + firstOfMonth.getDay() - 1) / 7) + 1;
  return `${date.getFullYear()}-${date.getMonth()}-${week}`;
}

export function getMonthlyActivityInsights(
  userId: string,
  activities: Activity[],
  date = new Date()
) {
  const monthActivities = getMonthlyActivities(userId, activities, date).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const totalMetres = monthActivities.reduce((sum, activity) => sum + activity.distance, 0);
  const monthlyKm = Math.round(totalMetres / 1000);
  const rideDays = new Set(monthActivities.map((activity) => getLocalDateKey(activity.date))).size;
  const activeWeeksThisMonth = new Set(monthActivities.map((activity) => getLocalWeekKey(activity.date))).size;
  const longestRideKm = monthActivities.length
    ? Math.round(Math.max(...monthActivities.map((activity) => activity.distance)) / 1000)
    : 0;
  const averageRideKm = monthActivities.length
    ? Math.round((totalMetres / 1000) / monthActivities.length)
    : 0;
  const totalMovingTime = monthActivities.reduce((sum, activity) => sum + activity.movingTime, 0);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayOfMonth = date.getDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const projectedMonthEndKm = Math.round((monthlyKm / Math.max(1, dayOfMonth)) * daysInMonth);

  return {
    activityCount: monthActivities.length,
    rideDays,
    activeWeeksThisMonth,
    longestRideKm,
    averageRideKm,
    totalMovingTime,
    monthlyKm,
    projectedMonthEndKm,
    kmNeededPerDay: (targetKm: number) => {
      const remainingKm = Math.max(0, targetKm - monthlyKm);
      return daysLeft > 0 ? Math.ceil(remainingKm / daysLeft) : 0;
    },
    lastSyncedRide: monthActivities[0],
  };
}

export function getRewardStats(user: User, activities: Activity[], date = new Date()) {
  const monthActivities = getMonthlyActivities(user.id, activities, date);
  const outdoorKm = getMonthlyKmForActivities(monthActivities.filter((a) => a.type === "Ride"));
  const indoorKm = getMonthlyKmForActivities(monthActivities.filter((a) => a.type === "VirtualRide"));
  const totalKm = outdoorKm + indoorKm;
  const nextTier = getNextTier(user.tier);

  return {
    monthKey: getMonthKey(date),
    totalKm,
    outdoorKm,
    indoorKm,
    complete: totalKm >= user.tier,
    officialRewardTier: isOfficialRewardTier(user.tier),
    overTierReview: nextTier ? totalKm >= nextTier : false,
  };
}

export function canRequestTierUpgrade(user: User, activities: Activity[], date = new Date()) {
  const nextTier = getNextTier(user.tier);
  if (!nextTier) return null;

  const monthlyKm = getMonthlyKmForUser(user.id, activities, date);
  if (monthlyKm < user.tier) return null;

  return {
    currentTier: user.tier,
    requestedTier: nextTier,
    monthlyKm,
    monthKey: getMonthKey(date),
    effectiveOn: getNextMonthStart(date),
  };
}
