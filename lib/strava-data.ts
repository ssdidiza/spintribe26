import { supabaseAdmin } from "@/lib/supabase";

type DbClient = ReturnType<typeof supabaseAdmin>;

/**
 * Purge all Strava-derived data for an athlete (deletion-on-deauthorization).
 *
 * Shared by the in-app Strava disconnect flow and the Strava athlete
 * deauthorization webhook so the two paths can never drift apart. Server-side
 * and idempotent: deletes are no-ops when nothing matches, and clearing tokens
 * twice is harmless, so duplicate webhook deliveries are safe.
 *
 * Removes the cached, Strava-derived records:
 *   - activities (cached rides)
 *   - champion_sessions (ride-linked champing proof)
 *   - stored Strava OAuth tokens + sync bookkeeping
 *
 * Deliberately does NOT delete the account row or non-Strava-derived history
 * (monthly_league_standings / league_memberships). Account deletion is a
 * separate, explicit action (Profile → "Delete account data").
 */
export async function purgeStravaData(db: DbClient, athleteId: string | number): Promise<void> {
  const id = String(athleteId);

  await db.from("activities").delete().eq("user_strava_id", id);
  await db.from("champion_sessions").delete().eq("user_strava_id", id);
  await db
    .from("users")
    .update({
      strava_access_token: null,
      strava_refresh_token: null,
      strava_token_expires_at: null,
      last_strava_sync_at: null,
      last_strava_sync_year: null,
      last_strava_sync_month: null,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", id);
}
