import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode, getStravaAthlete } from "@/lib/strava";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

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
    // 1. Exchange Strava code for tokens
    const tokens = await exchangeStravaCode(code);
    const athlete = await getStravaAthlete(tokens.accessToken);

    // 2. Upsert user in Supabase
    const db = supabaseAdmin();
    const { error: dbError } = await db.from("users").upsert(
      {
        strava_id: String(tokens.athleteId),
        name: `${athlete.firstname} ${athlete.lastname}`,
        avatar: athlete.profile,
        strava_access_token: tokens.accessToken,
        strava_refresh_token: tokens.refreshToken,
        strava_token_expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "strava_id" }
    );

    if (dbError) {
      console.error("Supabase upsert error:", dbError);
      // Non-fatal — continue without DB if Supabase isn't configured yet
    }

    // 3. Write signed session cookie (httpOnly — safe from XSS)
    const session = await getSession();
    session.athleteId = tokens.athleteId;
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.expiresAt = tokens.expiresAt;
    await session.save();

    // 4. Redirect to onboarding with public athlete info as params
    const url = new URL("/onboarding", req.url);
    url.searchParams.set("strava_id", String(tokens.athleteId));
    url.searchParams.set("name", `${athlete.firstname} ${athlete.lastname}`);
    url.searchParams.set("avatar", athlete.profile);

    const res = NextResponse.redirect(url);

    // Clear the CSRF state cookie
    res.cookies.delete("oauth_state");

    return res;
  } catch (err) {
    console.error("Strava OAuth error:", err);
    return NextResponse.redirect(new URL("/?error=strava_error", req.url));
  }
}
