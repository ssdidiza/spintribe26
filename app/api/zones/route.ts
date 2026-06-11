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
    // Zone stats aggregate rider activity, so the leaderboard consent rule
    // applies here as well: only onboarded riders who opted in are counted.
    db
      .from("users")
      .select("strava_id,name,zone,country,onboarded")
      .eq("onboarded", true)
      .eq("leaderboard_consent", true),
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
  const consentedIds = new Set(users.map((user) => String(user.strava_id)));

  // Zone detection from GPS only covers part of the rides, so each rider's
  // profile zone is the fallback. Profile zones are matched by exact zone id
  // or name (normalized) — a bare region like "Gauteng" spans several zones
  // and cannot be attributed to one, so it stays unresolved on purpose.
  const zoneByKey = new Map<string, string>();
  for (const zone of zonesById.values()) {
    zoneByKey.set(normalize(zone.id), zone.id);
    zoneByKey.set(normalize(zone.name), zone.id);
  }
  const profileZoneByUser = new Map<string, string>();
  for (const user of users) {
    const resolved = zoneByKey.get(normalize(user.zone));
    if (resolved) profileZoneByUser.set(String(user.strava_id), resolved);
  }

  const statsByZone = new Map<string, {
    metres: number;
    elevation: number;
    rides: number;
    gpsRides: number;
    profileRides: number;
    activeRiders: Set<string>;
  }>();
  const unattributed = { rides: 0, metres: 0, riders: new Set<string>() };

  for (const activity of activitiesResult.data ?? []) {
    if (!isCycling(activity.type)) continue;
    const riderId = String(activity.user_strava_id);
    if (!consentedIds.has(riderId)) continue;

    const gpsZoneId = activity.detected_zone_id ? String(activity.detected_zone_id) : "";
    const zoneId = gpsZoneId && zonesById.has(gpsZoneId)
      ? gpsZoneId
      : profileZoneByUser.get(riderId) ?? "";

    if (!zoneId) {
      unattributed.rides += 1;
      unattributed.metres += Number(activity.distance ?? 0);
      unattributed.riders.add(riderId);
      continue;
    }

    const current = statsByZone.get(zoneId) ?? {
      metres: 0,
      elevation: 0,
      rides: 0,
      gpsRides: 0,
      profileRides: 0,
      activeRiders: new Set<string>(),
    };
    current.metres += Number(activity.distance ?? 0);
    current.elevation += Number(activity.elevation_gain ?? 0);
    current.rides += 1;
    if (gpsZoneId && zonesById.has(gpsZoneId)) current.gpsRides += 1;
    else current.profileRides += 1;
    current.activeRiders.add(riderId);
    statsByZone.set(zoneId, current);
  }

  const promotionsByZone = new Map<string, number>();
  for (const promotion of promotionsResult.data ?? []) {
    const zoneId = profileZoneByUser.get(String(promotion.user_strava_id));
    if (!zoneId) continue;
    promotionsByZone.set(zoneId, (promotionsByZone.get(zoneId) ?? 0) + 1);
  }

  const totalOnboarded = Math.max(1, users.length);
  const zones = [...zonesById.values()].map((zone) => {
    const stats = statsByZone.get(zone.id);
    return {
      ...zone,
      totalDistanceKm: Math.round((stats?.metres ?? 0) / 1000),
      totalElevation: Math.round(stats?.elevation ?? 0),
      rideCount: stats?.rides ?? 0,
      gpsRides: stats?.gpsRides ?? 0,
      profileRides: stats?.profileRides ?? 0,
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
    unattributed: {
      rides: unattributed.rides,
      totalDistanceKm: Math.round(unattributed.metres / 1000),
      riders: unattributed.riders.size,
    },
  });
}
