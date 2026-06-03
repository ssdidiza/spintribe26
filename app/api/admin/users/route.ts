import { NextResponse } from "next/server";
import { getAdminContext, applyDueTierUpgrades } from "@/lib/admin-auth";
import { getMonthKey } from "@/lib/challenge";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  await applyDueTierUpgrades(ctx.db);

  const now = new Date();
  const rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();

  const { data: users, error: usersError } = await ctx.db
    .from("users")
    .select("strava_id,name,avatar,role,tier,onboarded,zone,country,last_strava_sync_at,leaderboard_consent,rewards_export_consent,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const { data: activities, error: activitiesError } = await ctx.db
    .from("activities")
    .select("user_strava_id,distance,type,date")
    .gte("date", rangeStart)
    .lt("date", rangeEnd);

  if (activitiesError) {
    return NextResponse.json({ error: activitiesError.message }, { status: 500 });
  }

  const statsByUser = new Map<string, { monthlyKm: number; activityCount: number; indoorKm: number; outdoorKm: number }>();
  for (const activity of activities ?? []) {
    const stravaId = String(activity.user_strava_id);
    const current = statsByUser.get(stravaId) ?? { monthlyKm: 0, activityCount: 0, indoorKm: 0, outdoorKm: 0 };
    const km = Number(activity.distance) / 1000;
    current.monthlyKm += km;
    current.activityCount += 1;
    if (activity.type === "VirtualRide") current.indoorKm += km;
    if (activity.type === "Ride") current.outdoorKm += km;
    statsByUser.set(stravaId, current);
  }

  const rows = (users ?? []).map((user) => {
    const stats = statsByUser.get(String(user.strava_id)) ?? { monthlyKm: 0, activityCount: 0, indoorKm: 0, outdoorKm: 0 };
    return {
      id: String(user.strava_id),
      stravaId: String(user.strava_id),
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      tier: Number(user.tier),
      onboarded: user.onboarded,
      zone: user.zone,
      country: user.country,
      leaderboardConsent: user.leaderboard_consent === true,
      rewardsExportConsent: user.rewards_export_consent === true,
      lastStravaSyncAt: user.last_strava_sync_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      isCurrentUser: String(user.strava_id) === ctx.userId,
      monthlyKm: Math.round(stats.monthlyKm),
      indoorKm: Math.round(stats.indoorKm),
      outdoorKm: Math.round(stats.outdoorKm),
      activityCount: stats.activityCount,
    };
  });

  return NextResponse.json({
    monthKey: getMonthKey(now),
    caller: ctx.caller,
    users: rows,
  });
}
