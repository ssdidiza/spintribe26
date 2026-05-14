import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode, getStravaActivitiesForMonth } from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { detectZoneFromGPS } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?error=strava_denied", req.url));
  }

  // CSRF: verify state matches the cookie set in /api/auth/strava
  const expectedState = req.cookies.get("oauth_state")?.value;
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(new URL("/?error=strava_error", req.url));
  }

  try {
    // 1. Exchange code — athlete name/avatar are embedded in the token response
    const tokens = await exchangeStravaCode(code);
    const displayName = [tokens.athleteFirstname, tokens.athleteLastname]
      .filter(Boolean)
      .join(" ") || "Athlete";

    // 2. Upsert user in Supabase
    const db = supabaseAdmin();
    const { error: dbError } = await db.from("users").upsert(
      {
        strava_id: String(tokens.athleteId),
        name: displayName,
        avatar: tokens.athleteProfile,
        strava_access_token: tokens.accessToken,
        strava_refresh_token: tokens.refreshToken,
        strava_token_expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "strava_id" }
    );

    if (dbError) {
      console.error("Supabase upsert error:", dbError);
    }

    // 3. Initial activity sync — done here while we have a fresh token,
    //    so the dashboard loads with data immediately (no "syncing..." spinner).
    try {
      const now = new Date();
      const stravaActivities = await getStravaActivitiesForMonth(
        tokens.accessToken,
        now.getFullYear(),
        now.getMonth() + 1
      );
      if (stravaActivities.length > 0) {
        const rows = stravaActivities.map((a) => {
          const lat = a.start_latlng?.[0];
          const lng = a.start_latlng?.[1];
          return {
            strava_id: String(a.id),
            user_strava_id: String(tokens.athleteId),
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
        await db.from("activities").upsert(rows, { onConflict: "strava_id" });
      }
    } catch (syncErr) {
      console.error("Initial activity sync failed (non-fatal):", syncErr);
    }

    // 4. Write signed session cookie (httpOnly — safe from XSS)
    const session = await getSession();
    session.athleteId = tokens.athleteId;
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.expiresAt = tokens.expiresAt;
    await session.save();

    // 5. Redirect — re-auth returns to dashboard; new users go to onboarding.
    const isReauth = req.cookies.get("oauth_reauth")?.value === "1";
    const dest = isReauth
      ? new URL("/dashboard", req.url)
      : (() => {
          const u = new URL("/onboarding", req.url);
          u.searchParams.set("strava_id", String(tokens.athleteId));
          u.searchParams.set("name", displayName);
          u.searchParams.set("avatar", tokens.athleteProfile);
          return u;
        })();

    const res = NextResponse.redirect(dest);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_reauth");

    return res;
  } catch (err) {
    console.error("Strava OAuth error:", err);
    return NextResponse.redirect(new URL("/?error=strava_error", req.url));
  }
}
