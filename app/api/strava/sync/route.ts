import { NextRequest, NextResponse } from "next/server";
import {
  getStravaActivitiesForMonth,
  StravaApiError,
} from "@/lib/strava";
import type { SanitizedStravaActivity } from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { detectZoneFromGPS } from "@/lib/types";
import type { LeaderboardApiResponse, LeaderboardEntry } from "@/lib/types";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";
import {
  buildLeaderboardResponse,
  findLeaderboardEntry,
  getLeaderboardMonthRange,
} from "@/lib/leaderboard";
import type { LeaderboardActivityRow, LeaderboardUserRow } from "@/lib/leaderboard";

const SYNC_COOLDOWN_MS = 10 * 60 * 1000;
type DbClient = ReturnType<typeof supabaseAdmin>;

type CachedActivityRow = {
  strava_id: string;
  name: string;
  distance: number;
  elevation_gain: number | null;
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
  total_elevation_gain?: number;
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
    total_elevation_gain: a.total_elevation_gain ?? 0,
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
    total_elevation_gain: Number(row.elevation_gain ?? 0),
    moving_time: row.moving_time,
    type: row.type,
    start_date: row.date,
    kudos_count: row.kudos ?? 0,
    detected_zone_id: row.detected_zone_id,
  };
}

async function fetchLeaderboardSnapshot(db: DbClient, date: Date) {
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(date);
  const [usersResult, activitiesResult] = await Promise.all([
    db
      .from("users")
      .select("strava_id,name,avatar,role,tier,team_id,current_league_id,current_league_name,current_league_threshold,zone,country,onboarded,leaderboard_consent,teams(name,slug)")
      .eq("onboarded", true)
      .eq("leaderboard_consent", true),
    db
      .from("activities")
      .select("user_strava_id,distance,elevation_gain,type,date")
      .gte("date", rangeStart)
      .lt("date", rangeEnd),
  ]);

  if (usersResult.error) throw usersResult.error;
  if (activitiesResult.error) throw activitiesResult.error;

  return buildLeaderboardResponse(
    (usersResult.data ?? []) as LeaderboardUserRow[],
    (activitiesResult.data ?? []) as LeaderboardActivityRow[],
    date
  );
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "A rider";
}

function getTrailingBody(entry: LeaderboardEntry, above: LeaderboardEntry) {
  const gap = Math.max(0, above.totalKm - entry.totalKm);
  const leagueName = entry.leagueName ?? `${entry.user.tier} Club`;
  if (gap === 0) {
    return `${above.user.name} is just ahead of you at #${above.rank} in the ${leagueName}. Sync after your next ride to move up.`;
  }

  return `${above.user.name} is ${gap} km ahead of you at #${above.rank} in the ${leagueName}. Sync your latest rides to close the gap.`;
}

async function createLeaderboardNotifications(
  db: DbClient,
  athleteId: string,
  before: LeaderboardApiResponse,
  after: LeaderboardApiResponse
) {
  const beforeEntry = findLeaderboardEntry(before.tiers, athleteId);
  const afterEntry = findLeaderboardEntry(after.tiers, athleteId);
  if (!afterEntry) return;

  const monthKey = after.monthKey;
  const afterTierEntries = after.tiers[String(afterEntry.user.tier)]?.entries ?? [];
  const rows: {
    user_strava_id: string;
    type: "leaderboard";
    title: string;
    body: string;
    dedupe_key: string;
  }[] = [];

  const above = afterTierEntries.find((entry) => entry.rank === afterEntry.rank - 1);
  if (above) {
    rows.push({
      user_strava_id: athleteId,
      type: "leaderboard",
      title: `You are behind ${getFirstName(above.user.name)}`,
      body: getTrailingBody(afterEntry, above),
      dedupe_key: `leaderboard:${monthKey}:behind:${athleteId}:by:${above.user.id}`,
    });
  }

  if (beforeEntry && afterEntry.rank < beforeEntry.rank) {
    const beforeTierEntries = before.tiers[String(beforeEntry.user.tier)]?.entries ?? [];
    const afterEntryByUserId = new Map(afterTierEntries.map((entry) => [entry.user.id, entry]));
    const syncingName = getFirstName(afterEntry.user.name);

    for (const entry of beforeTierEntries) {
      if (entry.user.id === athleteId || entry.rank >= beforeEntry.rank) continue;
      const currentEntry = afterEntryByUserId.get(entry.user.id);
      if (!currentEntry || currentEntry.rank <= afterEntry.rank) continue;

      rows.push({
        user_strava_id: entry.user.id,
        type: "leaderboard",
        title: `${syncingName} just passed you`,
        body: `${afterEntry.user.name} moved to #${afterEntry.rank} with ${afterEntry.totalKm} km. You are now #${currentEntry.rank}; sync your latest rides to respond.`,
        dedupe_key: `leaderboard:${monthKey}:surpassed:${entry.user.id}:by:${athleteId}`,
      });
    }
  }

  if (!rows.length) return;

  const { error } = await db
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });

  if (error) throw error;
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
  const athleteId = String(session.athleteId);
  const leaderboardDate = new Date(Date.UTC(y, m - 1, 1));
  let leaderboardBefore: LeaderboardApiResponse | null = null;

  try {
    leaderboardBefore = await fetchLeaderboardSnapshot(db, leaderboardDate);
  } catch (error) {
    console.warn("Leaderboard snapshot before sync failed:", error);
  }

  const syncMonths = scope === "year"
    ? Array.from({ length: y === now.getFullYear() ? now.getMonth() + 1 : 12 }, (_, i) => i + 1)
    : [m];
  const rangeStart = new Date(Date.UTC(y, syncMonths[0] - 1, 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(y, syncMonths[syncMonths.length - 1], 1)).toISOString();

  const { data: user } = await db
    .from("users")
    .select("last_strava_sync_at,last_strava_sync_year,last_strava_sync_month")
    .eq("strava_id", athleteId)
    .maybeSingle();

  const cached = await db
    .from("activities")
    .select("strava_id,name,distance,elevation_gain,moving_time,type,date,kudos,detected_zone_id")
    .eq("user_strava_id", athleteId)
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
      user_strava_id: athleteId,
      name: a.name,
      distance: a.distance,
      elevation_gain: a.total_elevation_gain ?? 0,
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
      .eq("user_strava_id", athleteId)
      .in("strava_activity_id", staleActivityIds);

    await db
      .from("activities")
      .delete()
      .eq("user_strava_id", athleteId)
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
    .eq("strava_id", athleteId);

  if (leaderboardBefore) {
    try {
      const leaderboardAfter = await fetchLeaderboardSnapshot(db, leaderboardDate);
      await createLeaderboardNotifications(db, athleteId, leaderboardBefore, leaderboardAfter);
    } catch (error) {
      console.warn("Leaderboard notifications after sync failed:", error);
    }
  }

  return NextResponse.json({ activities: sanitized, cached: false });
}
