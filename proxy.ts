/**
 * Server-side route protection via iron-session.
 * Redirects unauthenticated requests on protected routes to the landing page.
 * Next.js 16 uses the proxy.ts convention.
 */
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";

const sessionOptions = {
  cookieName: "spintribe_session",
  password: (process.env.NEXTAUTH_SECRET ?? process.env.SESSION_SECRET)!,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req.cookies as never, sessionOptions);

  if (!session.athleteId && !session.userId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/champion/:path*",
    "/leaderboard/:path*",
    "/profile/:path*",
    "/admin/:path*",
  ],
};
