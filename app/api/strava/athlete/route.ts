import { NextResponse } from "next/server";
import { getStravaAthlete, StravaApiError } from "@/lib/strava";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";

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

  const accessToken = await getFreshStravaAccessToken(session.athleteId);
  if (!accessToken) {
    return NextResponse.json({ error: "Strava disconnected" }, { status: 409 });
  }

  let athlete;
  try {
    athlete = await getStravaAthlete(accessToken);
  } catch (e) {
    if (e instanceof StravaApiError) {
      return NextResponse.json(
        { error: "Strava unavailable", status: e.status },
        { status: e.status === 429 ? 429 : 502 }
      );
    }
    throw e;
  }

  // Persist FTP to Supabase so it survives sessions
  if (athlete.ftp) {
    try {
      const db = supabaseAdmin();
      await db
        .from("users")
        .update({ ftp: athlete.ftp, country: athlete.country ?? null })
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
