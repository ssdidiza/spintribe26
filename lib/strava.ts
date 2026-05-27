/**
 * Strava API integration layer.
 *
 * Production apps should set STRAVA_SCOPES to the minimum permission needed.
 * SpinTribe defaults to activity:read for public/followers activity challenge
 * data. Use activity:read_all only if private activities are essential and
 * clearly explained to users during review.
 */

const STRAVA_BASE = "https://www.strava.com/api/v3";
const STRAVA_AUTH = "https://www.strava.com/oauth";

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix epoch seconds
  athleteId: number;
  athleteFirstname: string;
  athleteLastname: string;
  athleteProfile: string;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
  ftp?: number;
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
  start_latlng?: [number, number];
}

export interface SanitizedStravaActivity extends Omit<StravaActivity, "start_latlng"> {
  detected_zone_id?: string | null;
}

export class StravaApiError extends Error {
  status: number;
  rateLimit?: string | null;
  rateUsage?: string | null;
  readRateLimit?: string | null;
  readRateUsage?: string | null;

  constructor(message: string, res: Response) {
    super(message);
    this.name = "StravaApiError";
    this.status = res.status;
    this.rateLimit = res.headers.get("x-ratelimit-limit");
    this.rateUsage = res.headers.get("x-ratelimit-usage");
    this.readRateLimit = res.headers.get("x-readratelimit-limit");
    this.readRateUsage = res.headers.get("x-readratelimit-usage");
  }
}

async function parseStravaResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Strava request failed with ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch {
      // Preserve the status-based message for non-JSON responses.
    }
    throw new StravaApiError(message, res);
  }
  return res.json() as Promise<T>;
}

export function getStravaAuthUrl(state: string, forceApproval = false): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    redirect_uri:
      process.env.STRAVA_REDIRECT_URI ??
      "http://localhost:3000/api/auth/strava/callback",
    response_type: "code",
    scope: process.env.STRAVA_SCOPES ?? "read,activity:read",
    approval_prompt: forceApproval ? "force" : "auto",
    state,
  });
  return `${STRAVA_AUTH}/authorize?${params}`;
}

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
  const data = await parseStravaResponse<{
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    athlete?: { id?: number; firstname?: string; lastname?: string; profile?: string };
  }>(res);
  return {
    accessToken: data.access_token ?? "",
    refreshToken: data.refresh_token ?? "",
    expiresAt: data.expires_at ?? 0,
    athleteId: data.athlete?.id ?? 0,
    athleteFirstname: data.athlete?.firstname ?? "",
    athleteLastname: data.athlete?.lastname ?? "",
    athleteProfile: data.athlete?.profile ?? "",
  };
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokens> {
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
  const data = await parseStravaResponse<{
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    athlete?: { id?: number; firstname?: string; lastname?: string; profile?: string };
  }>(res);
  return {
    // Strava's refresh endpoint does not return athlete data — intentional empty defaults.
    accessToken: data.access_token ?? "",
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_at ?? 0,
    athleteId: data.athlete?.id ?? 0,
    athleteFirstname: data.athlete?.firstname ?? "",
    athleteLastname: data.athlete?.lastname ?? "",
    athleteProfile: data.athlete?.profile ?? "",
  };
}

export async function getStravaAthlete(accessToken: string): Promise<StravaAthlete> {
  const res = await fetch(`${STRAVA_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseStravaResponse<StravaAthlete>(res);
}

export async function getStravaActivitiesForMonth(
  accessToken: string,
  year: number,
  month: number
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
  const activities = await parseStravaResponse<StravaActivity[]>(res);
  return activities.filter((a) =>
    ["Ride", "VirtualRide", "EBikeRide", "Velomobile"].includes(a.type)
  );
}

export async function deauthorizeStrava(accessToken: string): Promise<void> {
  const res = await fetch(`${STRAVA_AUTH}/deauthorize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await parseStravaResponse<unknown>(res);
}

export function sumCyclingKm(activities: StravaActivity[]): number {
  const total = activities.reduce((s, a) => s + a.distance, 0);
  return Math.round(total / 1000);
}
