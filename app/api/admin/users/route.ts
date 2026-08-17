import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { getMonthKey } from "@/lib/challenge";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const now = new Date();
  const rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();

  const [{ data: users, error: usersError }, { data: championMemberships, error: membershipError }] = await Promise.all([
    ctx.db
      .from("users")
      .select("strava_id,name,avatar,role,tier,onboarded,zone,country,last_strava_sync_at,leaderboard_consent,rewards_export_consent,created_at,updated_at")
      .order("created_at", { ascending: false }),
    ctx.db.from("team_memberships").select("user_strava_id").eq("role", "champion"),
  ]);

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });

  const { data: activities, error: activitiesError } = await ctx.db
    .from("activities")
    .select("user_strava_id,distance,type,date")
    .gte("date", rangeStart)
    .lt("date", rangeEnd);
  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  const championIds = new Set((championMemberships ?? []).map((membership) => String(membership.user_strava_id)));
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
    const id = String(user.strava_id);
    const stats = statsByUser.get(id) ?? { monthlyKm: 0, activityCount: 0, indoorKm: 0, outdoorKm: 0 };
    return {
      id,
      stravaId: id,
      name: user.name,
      avatar: user.avatar,
      // Legacy admin UI still presents a single Champion label. It is derived
      // from membership and is never persisted back to users.role.
      role: user.role === "admin" ? "admin" : championIds.has(id) ? "champion" : "member",
      tier: Number(user.tier),
      onboarded: user.onboarded,
      zone: user.zone,
      country: user.country,
      leaderboardConsent: user.leaderboard_consent === true,
      rewardsExportConsent: user.rewards_export_consent === true,
      lastStravaSyncAt: user.last_strava_sync_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      isCurrentUser: id === ctx.userId,
      monthlyKm: Math.round(stats.monthlyKm),
      indoorKm: Math.round(stats.indoorKm),
      outdoorKm: Math.round(stats.outdoorKm),
      activityCount: stats.activityCount,
    };
  });

  return NextResponse.json({ monthKey: getMonthKey(now), caller: ctx.caller, users: rows });
}
