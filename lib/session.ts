/**
 * Signed, httpOnly session cookie via iron-session.
 * Stores the Strava athlete ID server-side — JS on the client can never read it.
 */
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  athleteId?: number;
  userId?: string;
}

const sessionPassword =
  process.env.NEXTAUTH_SECRET ??
  process.env.SESSION_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-session-secret-for-local-routes-only-32");

const sessionOptions = {
  cookieName: "spintribe_session",
  password: sessionPassword!, // min 32 chars; required in production env
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export function getEffectiveUserId(session: SessionData): string | null {
  if (session.userId) return session.userId;
  if (session.athleteId) return String(session.athleteId);
  return null;
}
