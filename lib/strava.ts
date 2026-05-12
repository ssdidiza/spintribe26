/**
 * Strava API integration layer.
 *
 * To go live, create a Strava API application at https://www.strava.com/settings/api
 * and set the following environment variables in .env.local:
 *
 *   STRAVA_CLIENT_ID=your_client_id
 *   STRAVA_CLIENT_SECRET=your_client_secret
 *   STRAVA_REDIRECT_URI=http://localhost:3000/api/auth/strava/callback
 *   NEXTAUTH_SECRET=any_random_string
 */

const STRAVA_BASE = "https://www.strava.com/api/v3";
const STRAVA_AUTH = "https://www.strava.com/oauth";

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix epoch seconds
  athleteId: number;
  // Basic athlete info from the token exchange — always present, no extra API call needed
  athleteFirstname: string;
  athleteLastname: string;
  athleteProfile: string;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string; // avatar URL
  ftp?: number;    // Functional Threshold Power (watts) — may be null/0 if not set
  country?: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number; // metres
  moving_time: number; // seconds
  type: string;
  start_date: string; // ISO
  kudos_count: number;
  start_latlng?: [number, number]; // [lat, lng] — absent for indoor rides
}

/** Step 1: Build Strava OAuth URL (with CSRF state) */
export function getStravaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    redirect_uri:
      process.env.STRAVA_REDIRECT_URI ??
      "http://localhost:3000/api/auth/strava/callback",
    response_type: "code",
    scope: "activity:read_all",
    approval_prompt: "auto",
    state,
  });
  return `${STRAVA_AUTH}/authorize?${params}`;
}

/** Step 2: Exchange code for tokens */
export async function exchangeStravaCode(code: string): Promise<StravaTokens> {
  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id,
    athleteFirstname: data.athlete?.firstname ?? "",
    athleteLastname: data.athlete?.lastname ?? "",
    athleteProfile: data.athlete?.profile ?? "",
  };
}

/** Step 3: Refresh expired token */
export async function refreshStravaToken(
  refreshToken: string
): Promise<StravaTokens> {
  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id,
    // Strava's refresh endpoint does not return athlete data — intentional empty defaults.
    athleteFirstname: data.athlete?.firstname ?? "",
    athleteLastname: data.athlete?.lastname ?? "",
    athleteProfile: data.athlete?.profile ?? "",
  };
}

/** Fetch athlete profile */
export async function getStravaAthlete(
  accessToken: string
): Promise<StravaAthlete> {
  const res = await fetch(`${STRAVA_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/** Fetch activities for a given month */
export async function getStravaActivitiesForMonth(
  accessToken: string,
  year: number,
  month: number // 1-indexed
): Promise<StravaActivity[]> {
  const after = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
  const before = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
  const params = new URLSearchParams({
    after: String(after),
    before: String(before),
    per_page: "100",
  });
  const res = await fetch(`${STRAVA_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const activities: StravaActivity[] = await res.json();
  // Filter to cycling only
  return activities.filter((a) =>
    ["Ride", "VirtualRide", "EBikeRide", "Velomobile"].includes(a.type)
  );
}

/** Sum up km for a month from activity list */
export function sumCyclingKm(activities: StravaActivity[]): number {
  const total = activities.reduce((s, a) => s + a.distance, 0);
  return Math.round(total / 1000);
}
