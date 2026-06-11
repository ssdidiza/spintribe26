import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode, getStravaActivitiesForMonth, getStravaAthlete } from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { detectZoneFromGPS } from "@/lib/types";
import { founderDefaults, founderRepairTier, isFounderUserId } from "@/lib/founder";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?error=strava_denied", req.url));
  }

  // CSRF: verify state matches the cookie set in /api/auth/strava.
  const expectedState = req.cookies.get("oauth_state")?.value;
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(new URL("/?error=strava_error", req.url));
  }

  try {
    // Athlete name/avatar are embedded in the token response.
    const tokens = await exchangeStravaCode(code);
    const displayName = [tokens.athleteFirstname, tokens.athleteLastname]
      .filter(Boolean)
      .join(" ") || "Athlete";

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

    // FTP is optional Strava profile data. Read it once during OAuth/re-auth,
    // then serve it from our cache unless the athlete explicitly refreshes it.
    try {
      const athlete = await getStravaAthlete(tokens.accessToken);
      await db
        .from("users")
        .update({
          ftp: athlete.ftp ?? null,
          country: athlete.country ?? null,
          ftp_cached_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("strava_id", String(tokens.athleteId));
    } catch (profileErr) {
      console.error("Athlete profile sync failed (non-fatal):", profileErr);
    }

    // Initial activity sync uses the fresh token so the dashboard opens with data.
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
            elevation_gain: a.total_elevation_gain ?? 0,
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

    let { data: existingUser } = await db
      .from("users")
      .select("onboarded, role, tier, team_id, current_league_id, current_league_name, current_league_threshold, zone, leaderboard_consent, rewards_export_consent")
      .eq("strava_id", String(tokens.athleteId))
      .maybeSingle();

    if (existingUser && isFounderUserId(tokens.athleteId) && existingUser.role !== "admin") {
      const founder = founderDefaults();
      const repair = {
        role: founder.role,
        tier: founderRepairTier(existingUser.tier),
        zone: founder.zone,
        onboarded: true,
        updated_at: new Date().toISOString(),
      };

      const { data: repairedUser, error: repairError } = await db
        .from("users")
        .update(repair)
        .eq("strava_id", String(tokens.athleteId))
        .select("onboarded, role, tier, team_id, current_league_id, current_league_name, current_league_threshold, zone, leaderboard_consent, rewards_export_consent")
        .maybeSingle();

      if (repairError) {
        console.error("Founder profile repair failed:", repairError);
      } else {
        existingUser = repairedUser ?? { ...existingUser, ...repair };
      }
    }

    const session = await getSession();
    session.athleteId = tokens.athleteId;
    session.userId = undefined;
    await session.save();

    let redirectUrl: URL;
    if (existingUser?.onboarded) {
      // Returning user: route through /onboarding?returning=1 so the client
      // can restore Zustand state (which was cleared on logout) before entering
      // the dashboard. The dashboard redirects to / when currentUser is null.
      redirectUrl = new URL("/onboarding", req.url);
      redirectUrl.searchParams.set("returning", "1");
      redirectUrl.searchParams.set("strava_id", String(tokens.athleteId));
      redirectUrl.searchParams.set("name", displayName);
      redirectUrl.searchParams.set("avatar", tokens.athleteProfile);
      if (existingUser.role) redirectUrl.searchParams.set("role", existingUser.role);
      if (existingUser.tier) redirectUrl.searchParams.set("tier", String(existingUser.tier));
      if (existingUser.team_id) redirectUrl.searchParams.set("team_id", String(existingUser.team_id));
      if (existingUser.current_league_id) redirectUrl.searchParams.set("current_league_id", String(existingUser.current_league_id));
      if (existingUser.current_league_name) redirectUrl.searchParams.set("current_league_name", String(existingUser.current_league_name));
      if (existingUser.current_league_threshold) redirectUrl.searchParams.set("current_league_threshold", String(existingUser.current_league_threshold));
      if (existingUser.zone) redirectUrl.searchParams.set("zone", existingUser.zone);
      redirectUrl.searchParams.set("leaderboard_consent", existingUser.leaderboard_consent ? "1" : "0");
      redirectUrl.searchParams.set("rewards_export_consent", existingUser.rewards_export_consent ? "1" : "0");
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
