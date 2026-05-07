import { NextResponse } from "next/server";
import { getStravaAuthUrl } from "@/lib/strava";
import { randomBytes } from "crypto";

/** GET /api/auth/strava — redirect user to Strava OAuth with CSRF state */
export function GET() {
  // Generate a random state token to prevent CSRF on callback
  const state = randomBytes(16).toString("hex");

  const url = getStravaAuthUrl(state);

  const res = NextResponse.redirect(url);

  // Store state in a short-lived cookie (httpOnly, 10 min TTL)
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  return res;
}
