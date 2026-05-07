/**
 * Signed, httpOnly session cookie via iron-session.
 * Stores the Strava athlete ID server-side — JS on the client can never read it.
 */
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  athleteId?: number;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

const sessionOptions = {
  cookieName: "spintribe_session",
  password: (process.env.NEXTAUTH_SECRET ?? process.env.SESSION_SECRET)!,   // min 32 chars
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
