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
            detected_zone_id: detectZoneFromGPS(lat, lng),
          };
        });
        await db.from("activities").upsert(rows, { onConflict: "strava_id" });
      }
      await db
        .from("users")
        .update({
          last_strava_sync_at: new Date().toISOString(),
          last_strava_sync_year: now.getFullYear(),
          last_strava_sync_month: now.getMonth() + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("strava_id", String(tokens.athleteId));
    } catch (syncErr) {
      console.error("Initial activity sync failed (non-fatal):", syncErr);
    }

    // Check if the user is already onboarded
    const { data: existingUser } = await db
      .from("users")
      .select("onboarded")
      .eq("strava_id", String(tokens.athleteId))
      .maybeSingle();

    // 4. Write signed session cookie (httpOnly — safe from XSS)
    const session = await getSession();
    session.athleteId = tokens.athleteId;
    await session.save();

    // 5. Redirect based on onboarding status (onboarded DB flag replaces isReauth cookie)
    let redirectUrl: URL;
    if (existingUser?.onboarded) {
      redirectUrl = new URL("/dashboard", req.url);
    } else {
      redirectUrl = new URL("/onboarding", req.url);
      redirectUrl.searchParams.set("strava_id", String(tokens.athleteId));
      redirectUrl.searchParams.set("name", displayName);
      redirectUrl.searchParams.set("avatar", tokens.athleteProfile);
    }

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_reauth");

    return res;
  } catch (err) {
    console.error("Strava OAuth error:", err);
    return NextResponse.redirect(new URL("/?error=strava_error", req.url));
  }
}
