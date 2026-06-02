import { NextRequest, NextResponse } from "next/server";
import {
  getStravaActivitiesForMonth,
  SanitizedStravaActivity,
  StravaApiError,
} from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { detectZoneFromGPS } from "@/lib/types";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";

const SYNC_COOLDOWN_MS = 10 * 60 * 1000;

type CachedActivityRow = {
  strava_id: string;
  name: string;
  distance: number;
  moving_time: number;
  type: string;
  date: string;
  kudos: number | null;
  detected_zone_id: string | null;
};

function sanitizeActivity(a: {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  type: string;
  start_date: string;
  kudos_count: number;
  start_latlng?: [number, number];
}): SanitizedStravaActivity {
  const lat = a.start_latlng?.[0];
  const lng = a.start_latlng?.[1];
  return {
    id: a.id,
    name: a.name,
    distance: a.distance,
    moving_time: a.moving_time,
    type: a.type,
    start_date: a.start_date,
    kudos_count: a.kudos_count,
    detected_zone_id: detectZoneFromGPS(lat, lng),
  };
}

function mapCachedActivity(row: CachedActivityRow): SanitizedStravaActivity {
  return {
    id: Number(row.strava_id),
    name: row.name,
    distance: Number(row.distance),
    moving_time: row.moving_time,
    type: row.type,
    start_date: row.date,
    kudos_count: row.kudos ?? 0,
    detected_zone_id: row.detected_zone_id,
  };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const forceRefresh = body.force === true;
  const scope = body.scope === "year" ? "year" : "month";
  const now = new Date();
  const rawYear = Number(body.year ?? now.getFullYear());
  const rawMonth = Number(body.month ?? now.getMonth() + 1);
  const y = Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= 2030 ? rawYear : now.getFullYear();
  const m = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;

  const db = supabaseAdmin();
  const syncMonths = scope === "year"
    ? Array.from({ length: y === now.getFullYear() ? now.getMonth() + 1 : 12 }, (_, i) => i + 1)
    : [m];
  const rangeStart = new Date(Date.UTC(y, syncMonths[0] - 1, 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(y, syncMonths[syncMonths.length - 1], 1)).toISOString();

  const { data: user } = await db
    .from("users")
    .select("last_strava_sync_at,last_strava_sync_year,last_strava_sync_month")
    .eq("strava_id", String(session.athleteId))
    .maybeSingle();

  const cached = await db
    .from("activities")
    .select("strava_id,name,distance,moving_time,type,date,kudos,detected_zone_id")
    .eq("user_strava_id", String(session.athleteId))
    .gte("date", rangeStart)
    .lt("date", rangeEnd)
    .order("date", { ascending: false });

  const lastSyncAt = user?.last_strava_sync_at ? new Date(user.last_strava_sync_at).getTime() : 0;
  const sameMonth = user?.last_strava_sync_year === y && user?.last_strava_sync_month === m;
  const withinCooldown = scope === "month" && !forceRefresh && sameMonth && Date.now() - lastSyncAt < SYNC_COOLDOWN_MS;

  if (withinCooldown && cached.data) {
    return NextResponse.json({
      activities: cached.data.map(mapCachedActivity),
      cached: true,
      nextSyncAt: new Date(lastSyncAt + SYNC_COOLDOWN_MS).toISOString(),
    });
  }

  const accessToken = await getFreshStravaAccessToken(session.athleteId);
  if (!accessToken) {
    return NextResponse.json({ error: "Strava disconnected" }, { status: 409 });
  }

  let sanitized: SanitizedStravaActivity[];
  try {
    const stravaActivities = (
      await Promise.all(syncMonths.map((month) => getStravaActivitiesForMonth(accessToken, y, month)))
    ).flat();
    sanitized = stravaActivities.map(sanitizeActivity);
  } catch (e) {
    if (e instanceof StravaApiError) {
      if (e.status === 429 && cached.data) {
        return NextResponse.json(
          {
            activities: cached.data.map(mapCachedActivity),
            cached: true,
            error: "Strava rate limit reached; showing cached activities.",
            rateUsage: e.readRateUsage ?? e.rateUsage,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: "Strava unavailable", status: e.status },
        { status: e.status === 429 ? 429 : 502 }
      );
    }
    throw e;
  }

  if (sanitized.length > 0) {
    const rows = sanitized.map((a) => ({
      strava_id: String(a.id),
      user_strava_id: String(session.athleteId),
      name: a.name,
      distance: a.distance,
      moving_time: a.moving_time,
      type: a.type,
      date: a.start_date,
      kudos: a.kudos_count,
      detected_zone_id: a.detected_zone_id,
    }));

    await db.from("activities").upsert(rows, { onConflict: "strava_id" });
  }

  const currentStravaIds = new Set(sanitized.map((a) => String(a.id)));
  const staleActivityIds = (cached.data ?? [])
    .map((a) => String(a.strava_id))
    .filter((id) => !currentStravaIds.has(id));

  if (staleActivityIds.length > 0) {
    await db
      .from("champion_sessions")
      .delete()
      .eq("user_strava_id", String(session.athleteId))
      .in("strava_activity_id", staleActivityIds);

    await db
      .from("activities")
      .delete()
      .eq("user_strava_id", String(session.athleteId))
      .in("strava_id", staleActivityIds);
  }

  await db
    .from("users")
    .update({
      last_strava_sync_at: new Date().toISOString(),
      last_strava_sync_year: y,
      last_strava_sync_month: m,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", String(session.athleteId));

  return NextResponse.json({ activities: sanitized, cached: false });
}
