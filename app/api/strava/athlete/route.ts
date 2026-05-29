import { NextRequest, NextResponse } from "next/server";
import { getStravaAthlete, StravaApiError } from "@/lib/strava";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";

/**
 * GET /api/strava/athlete
 * Returns the athlete's own FTP profile field.
 * Defaults to cached Supabase data to avoid polling Strava on every dashboard load.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  const athleteId = String(session.athleteId);

  const { data: cachedUser } = await db
    .from("users")
    .select("ftp,country")
    .eq("strava_id", athleteId)
    .maybeSingle();

  if (!forceRefresh) {
    return NextResponse.json({
      ftp: cachedUser?.ftp ?? null,
      country: cachedUser?.country ?? null,
      source: "cache",
      refreshAvailable: true,
    });
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

  try {
    await db
      .from("users")
      .update({
        ftp: athlete.ftp ?? null,
        country: athlete.country ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("strava_id", athleteId);
  } catch {
    // Non-fatal: older deployments may not have the optional columns yet.
  }

  return NextResponse.json({
    ftp: athlete.ftp ?? null,
    country: athlete.country ?? null,
    name: `${athlete.firstname} ${athlete.lastname}`,
    source: "strava",
  });
}
