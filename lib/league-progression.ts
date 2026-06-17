import { supabaseAdmin } from "@/lib/supabase";
import { getMonthKey } from "@/lib/challenge";
import { getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getLeagueByTier, getLeagueForDistanceKm } from "@/lib/leagues";

type DbClient = ReturnType<typeof supabaseAdmin>;

const CYCLING_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "Velomobile"]);

export interface FastTrackResult {
  promoted: boolean;
  fromThreshold: number;
  toThreshold: number;
  monthlyKm: number;
  monthKey: string;
}

/**
 * Server-authoritative in-month fast-track promotion.
 *
 * Rules (see Phase 2 spec):
 *  - Promotion can happen immediately during the month, off server-verified
 *    Strava cycling distance only.
 *  - Promote UPWARD only — never demote mid-month (demotions are a month-end
 *    cron concern). Because monthly distance only ever grows within a month,
 *    `getLeagueForDistanceKm` can only return an equal-or-higher band.
 *  - If a rider crosses several thresholds at once, they go straight to the
 *    highest earned club (a single promotion event to that club).
 *  - Idempotent: a duplicate sync/webhook leaves the rider already at the
 *    earned club, so `earned.tier <= current` short-circuits with no write,
 *    and the promotion-event / notification upserts are de-duplicated.
 *
 * Returns null only on a read error (caller treats as no-op).
 */
export async function applyFastTrackPromotion(
  db: DbClient,
  athleteId: string | number,
  date = new Date()
): Promise<FastTrackResult | null> {
  const id = String(athleteId);
  const monthKey = getMonthKey(date);
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(date);

  const [{ data: user, error: userError }, { data: activities, error: activitiesError }] =
    await Promise.all([
      db
        .from("users")
        .select("current_league_threshold,tier")
        .eq("strava_id", id)
        .maybeSingle(),
      db
        .from("activities")
        .select("distance,type")
        .eq("user_strava_id", id)
        .gte("date", rangeStart)
        .lt("date", rangeEnd),
    ]);

  if (userError || activitiesError || !user) return null;

  const currentThreshold = Number(user.current_league_threshold ?? user.tier ?? 200);
  const monthlyKm = Math.round(
    (activities ?? [])
      .filter((activity) => CYCLING_TYPES.has(String(activity.type)))
      .reduce((sum, activity) => sum + Number(activity.distance ?? 0), 0) / 1000
  );

  const earned = getLeagueForDistanceKm(monthlyKm);

  // Upward-only. No-op (and therefore idempotent) once already at/above earned.
  if (earned.tier <= currentThreshold) {
    return { promoted: false, fromThreshold: currentThreshold, toThreshold: currentThreshold, monthlyKm, monthKey };
  }

  const fromLeague = getLeagueByTier(currentThreshold);
  const { data: leagueRow } = await db
    .from("leagues")
    .select("id")
    .eq("name", earned.name)
    .maybeSingle();

  await db
    .from("users")
    .update({
      tier: earned.tier,
      current_league_id: leagueRow?.id ?? null,
      current_league_name: earned.name,
      current_league_threshold: earned.tier,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", id);

  // Idempotent promotion history (unique on user + month + destination club).
  await db.from("league_promotion_events").upsert(
    {
      user_strava_id: id,
      month_key: monthKey,
      from_league_threshold: currentThreshold,
      to_league_threshold: earned.tier,
      from_league_name: fromLeague.name,
      to_league_name: earned.name,
      km_at_promotion: monthlyKm,
      kind: "fast_track",
    },
    { onConflict: "user_strava_id,month_key,to_league_threshold", ignoreDuplicates: true }
  );

  // Idempotent in-app notification (no web push / email in this branch).
  await db.from("notifications").upsert(
    {
      user_strava_id: id,
      type: "achievement",
      title: `Promoted to the ${earned.name}`,
      body: `You reached ${monthlyKm} km this month and moved up from the ${fromLeague.name} to the ${earned.name}. Keep riding to hold it at month-end.`,
      dedupe_key: `promotion:${monthKey}:${id}:${earned.tier}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  );

  return { promoted: true, fromThreshold: currentThreshold, toThreshold: earned.tier, monthlyKm, monthKey };
}
