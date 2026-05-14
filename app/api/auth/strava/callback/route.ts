import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode } from "@/lib/strava";
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
      // Non-fatal — continue without DB if Supabase isn't configured yet
    }

    // 3. Write signed session cookie (httpOnly — safe from XSS)
    const session = await getSession();
    session.athleteId = tokens.athleteId;
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.expiresAt = tokens.expiresAt;
    await session.save();

    // 4. Redirect — re-auth returns to dashboard (session + tokens refreshed);
    //    new users go to onboarding to pick role/tier.
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
