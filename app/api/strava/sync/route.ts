import { NextRequest, NextResponse } from "next/server";
import { getStravaActivitiesForMonth, refreshStravaToken } from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { detectZoneFromGPS } from "@/lib/types";

export async function POST(req: NextRequest) {
  // 1. Verify signed session
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  // Validate and clamp year/month to safe ranges
  const rawYear = Number(body.year ?? now.getFullYear());
  const rawMonth = Number(body.month ?? now.getMonth() + 1);
  const y = Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= 2030 ? rawYear : now.getFullYear();
  const m = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;

  // 2. Refresh token if expired
  let accessToken = session.accessToken!;
  if (session.expiresAt && session.expiresAt < Math.floor(Date.now() / 1000) + 60) {
    try {
      const refreshed = await refreshStravaToken(session.refreshToken!);
      accessToken = refreshed.accessToken;
      session.accessToken = refreshed.accessToken;
      session.refreshToken = refreshed.refreshToken;
      session.expiresAt = refreshed.expiresAt;
      await session.save();

      // Update token in Supabase too
      const db = supabaseAdmin();
      await db
        .from("users")
        .update({
          strava_access_token: refreshed.accessToken,
          strava_refresh_token: refreshed.refreshToken,
          strava_token_expires_at: refreshed.expiresAt,
        })
        .eq("strava_id", String(session.athleteId));
    } catch (e) {
      console.error("Token refresh failed:", e);
    }
  }

  // 3. Fetch activities from Strava API
  const stravaActivities = await getStravaActivitiesForMonth(accessToken, y, m);

  // 4. Persist to Supabase
  if (stravaActivities.length > 0) {
    const db = supabaseAdmin();
    const rows = stravaActivities.map((a) => {
      const lat = a.start_latlng?.[0];
      const lng = a.start_latlng?.[1];
      return {
        strava_id: String(a.id),
        user_strava_id: String(session.athleteId),
        name: a.name,
        distance: a.distance,
        moving_time: a.moving_time,
        type: a.type,
        date: a.start_date,
        kudos: a.kudos_count,
        start_lat: lat ?? null,
        start_lng: lng ?? null,
        detected_zone_id: detectZoneFromGPS(lat, lng),
      };
    });

    await db
      .from("activities")
      .upsert(rows, { onConflict: "strava_id" });
  }

  return NextResponse.json({ activities: stravaActivities });
}
