import { supabaseAdmin } from "@/lib/supabase";
import { refreshStravaToken } from "@/lib/strava";

export interface StoredStravaToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function getStoredStravaToken(athleteId: number): Promise<StoredStravaToken | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("strava_access_token,strava_refresh_token,strava_token_expires_at")
    .eq("strava_id", String(athleteId))
    .maybeSingle();

  if (error || !data?.strava_refresh_token) return null;

  return {
    accessToken: data.strava_access_token ?? "",
    refreshToken: data.strava_refresh_token,
    expiresAt: Number(data.strava_token_expires_at ?? 0),
  };
}

export async function getFreshStravaAccessToken(athleteId: number): Promise<string | null> {
  const stored = await getStoredStravaToken(athleteId);
  if (!stored) return null;

  if (stored.accessToken && stored.expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return stored.accessToken;
  }

  const refreshed = await refreshStravaToken(stored.refreshToken);
  const db = supabaseAdmin();
  await db
    .from("users")
    .update({
      strava_access_token: refreshed.accessToken,
      strava_refresh_token: refreshed.refreshToken,
      strava_token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", String(athleteId));

  return refreshed.accessToken;
}
