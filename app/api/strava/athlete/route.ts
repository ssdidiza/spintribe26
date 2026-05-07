import { NextResponse } from "next/server";
import { getStravaAthlete, refreshStravaToken } from "@/lib/strava";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/strava/athlete
 * Returns the athlete's FTP and profile from Strava API v3.
 * The ftp field lives directly on the athlete object (GET /athlete).
 */
export async function GET() {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Refresh token if near expiry
  let accessToken = session.accessToken!;
  if (session.expiresAt && session.expiresAt < Math.floor(Date.now() / 1000) + 60) {
    try {
      const refreshed = await refreshStravaToken(session.refreshToken!);
      accessToken = refreshed.accessToken;
      session.accessToken = refreshed.accessToken;
      session.refreshToken = refreshed.refreshToken;
      session.expiresAt = refreshed.expiresAt;
      await session.save();
    } catch (e) {
      console.error("Token refresh failed:", e);
    }
  }

  const athlete = await getStravaAthlete(accessToken);

  // Persist FTP to Supabase so it survives sessions
  if (athlete.ftp) {
    try {
      const db = supabaseAdmin();
      await db
        .from("users")
        .update({ ftp: athlete.ftp })
        .eq("strava_id", String(session.athleteId));
    } catch {
      // non-fatal — column may not exist yet
    }
  }

  return NextResponse.json({
    ftp: athlete.ftp ?? null,
    country: athlete.country ?? null,
    name: `${athlete.firstname} ${athlete.lastname}`,
  });
}
