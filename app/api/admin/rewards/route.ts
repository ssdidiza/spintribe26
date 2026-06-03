import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { getMonthKey, getNextTier, isOfficialRewardTier } from "@/lib/challenge";
import { Tier } from "@/lib/types";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const now = new Date();
  const rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();

  const { data: users, error: usersError } = await ctx.db
    .from("users")
    .select("strava_id,name,avatar,role,tier,zone,leaderboard_consent,rewards_export_consent")
    .order("tier", { ascending: true });

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const { data: activities, error: activitiesError } = await ctx.db
    .from("activities")
    .select("user_strava_id,distance,type,date")
    .gte("date", rangeStart)
    .lt("date", rangeEnd);

  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  const statsByUser = new Map<string, { totalKm: number; outdoorKm: number; indoorKm: number }>();
  for (const activity of activities ?? []) {
    const stravaId = String(activity.user_strava_id);
    const current = statsByUser.get(stravaId) ?? { totalKm: 0, outdoorKm: 0, indoorKm: 0 };
    const km = Number(activity.distance) / 1000;
    current.totalKm += km;
    if (activity.type === "Ride") current.outdoorKm += km;
    if (activity.type === "VirtualRide") current.indoorKm += km;
    statsByUser.set(stravaId, current);
  }

  const rows = (users ?? []).map((user) => {
    const tier = Number(user.tier) as Tier;
    const stats = statsByUser.get(String(user.strava_id)) ?? { totalKm: 0, outdoorKm: 0, indoorKm: 0 };
    const rounded = {
      totalKm: Math.round(stats.totalKm),
      outdoorKm: Math.round(stats.outdoorKm),
      indoorKm: Math.round(stats.indoorKm),
    };
    const nextTier = getNextTier(tier);
    const officialRewardTier = isOfficialRewardTier(tier);
    const complete = rounded.totalKm >= tier;
    const consent = user.rewards_export_consent === true;

    return {
      stravaId: String(user.strava_id),
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      tier,
      zone: user.zone,
      totalKm: rounded.totalKm,
      outdoorKm: rounded.outdoorKm,
      indoorKm: rounded.indoorKm,
      complete,
      consent,
      officialRewardTier,
      eligibleForExport: consent && complete && officialRewardTier,
      overTierReview: nextTier ? rounded.totalKm >= nextTier : false,
      leaderboardConsent: user.leaderboard_consent === true,
    };
  });

  return NextResponse.json({
    monthKey: getMonthKey(now),
    rows,
    exportRows: rows.filter((row) => row.eligibleForExport),
  });
}
