import { NextResponse } from "next/server";
import { getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { SEED_ZONES } from "@/lib/types";

function isCycling(type: string | null) {
  return type === "Ride" || type === "VirtualRide" || type === "EBikeRide" || type === "Velomobile";
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(now);

  const [zonesResult, usersResult, activitiesResult, promotionsResult] = await Promise.all([
    db.from("zones").select("id,name,region,type,description,usage_count,created_at"),
    db.from("users").select("strava_id,name,zone,country,onboarded").eq("onboarded", true),
    db
      .from("activities")
      .select("user_strava_id,distance,elevation_gain,type,detected_zone_id")
      .gte("date", rangeStart)
      .lt("date", rangeEnd),
    db
      .from("league_memberships")
      .select("user_strava_id,promoted_from_league_id")
      .eq("month_key", monthKey)
      .not("promoted_from_league_id", "is", null),
  ]);

  if (zonesResult.error) return NextResponse.json({ error: zonesResult.error.message }, { status: 500 });
  if (usersResult.error) return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
  if (activitiesResult.error) return NextResponse.json({ error: activitiesResult.error.message }, { status: 500 });
  if (promotionsResult.error) return NextResponse.json({ error: promotionsResult.error.message }, { status: 500 });

  const customZones = (zonesResult.data ?? []).map((zone) => ({
    id: String(zone.id),
    name: zone.name,
    region: zone.region,
    type: zone.type,
    description: zone.description ?? "",
    usageCount: zone.usage_count ?? 0,
    createdAt: zone.created_at,
  }));
  const zonesById = new Map([...SEED_ZONES, ...customZones].map((zone) => [zone.id, zone]));
  const users = usersResult.data ?? [];
  const userById = new Map(users.map((user) => [String(user.strava_id), user]));
  const statsByZone = new Map<string, {
    metres: number;
    elevation: number;
    rides: number;
    activeRiders: Set<string>;
  }>();

  for (const activity of activitiesResult.data ?? []) {
    if (!isCycling(activity.type)) continue;
    const zoneId = activity.detected_zone_id ? String(activity.detected_zone_id) : "";
    if (!zoneId || !zonesById.has(zoneId)) continue;
    const current = statsByZone.get(zoneId) ?? {
      metres: 0,
      elevation: 0,
      rides: 0,
      activeRiders: new Set<string>(),
    };
    current.metres += Number(activity.distance ?? 0);
    current.elevation += Number(activity.elevation_gain ?? 0);
    current.rides += 1;
    current.activeRiders.add(String(activity.user_strava_id));
    statsByZone.set(zoneId, current);
  }

  const promotionsByZone = new Map<string, number>();
  for (const promotion of promotionsResult.data ?? []) {
    const user = userById.get(String(promotion.user_strava_id));
    const userZone = normalize(user?.zone);
    const matchingZone = [...zonesById.values()].find((zone) =>
      normalize(zone.id) === userZone || normalize(zone.name) === userZone || normalize(zone.region) === userZone
    );
    if (!matchingZone) continue;
    promotionsByZone.set(matchingZone.id, (promotionsByZone.get(matchingZone.id) ?? 0) + 1);
  }

  const totalOnboarded = Math.max(1, users.length);
  const zones = [...zonesById.values()].map((zone) => {
    const stats = statsByZone.get(zone.id);
    return {
      ...zone,
      totalDistanceKm: Math.round((stats?.metres ?? 0) / 1000),
      totalElevation: Math.round(stats?.elevation ?? 0),
      rideCount: stats?.rides ?? 0,
      activeRiders: stats?.activeRiders.size ?? 0,
      participationRate: Math.round(((stats?.activeRiders.size ?? 0) / totalOnboarded) * 100),
      promotions: promotionsByZone.get(zone.id) ?? 0,
    };
  });

  return NextResponse.json({
    monthKey,
    zones: zones.sort((a, b) =>
      b.totalDistanceKm - a.totalDistanceKm ||
      b.totalElevation - a.totalElevation ||
      a.name.localeCompare(b.name)
    ),
  });
}
