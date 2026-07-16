import { NextRequest, NextResponse } from "next/server";
import { getStravaAuthUrl } from "@/lib/strava";
import { randomBytes } from "crypto";

/** GET /api/auth/strava — redirect user to Strava OAuth with CSRF state
 *  ?reauth=1  →  returning user updating scope; callback skips onboarding */
export function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const reauth = params.get("reauth") === "1";
  const link = params.get("link") === "1";
  const state = randomBytes(16).toString("hex");
  const url = getStravaAuthUrl(state, reauth);
  const res = NextResponse.redirect(url);

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10,
    path: "/",
  };

  res.cookies.set("oauth_state", state, cookieOpts);
  if (reauth) res.cookies.set("oauth_reauth", "1", cookieOpts);
  if (link) res.cookies.set("oauth_link", "1", cookieOpts);

  return res;
}
