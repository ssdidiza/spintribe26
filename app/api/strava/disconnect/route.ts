import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { deauthorizeStrava } from "@/lib/strava";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const deleteAccount = body.deleteAccount === true;
  const athleteId = String(session.athleteId);
  const db = supabaseAdmin();

  const accessToken = await getFreshStravaAccessToken(session.athleteId).catch(() => null);
  if (accessToken) {
    await deauthorizeStrava(accessToken).catch((e) => {
      console.warn("Strava deauthorization failed:", e);
    });
  }

  await db.from("activities").delete().eq("user_strava_id", athleteId);
  await db.from("champion_sessions").delete().eq("user_strava_id", athleteId);

  if (deleteAccount) {
    await db.from("users").delete().eq("strava_id", athleteId);
  } else {
    await db
      .from("users")
      .update({
        strava_access_token: null,
        strava_refresh_token: null,
        strava_token_expires_at: null,
        last_strava_sync_at: null,
        last_strava_sync_year: null,
        last_strava_sync_month: null,
        updated_at: new Date().toISOString(),
      })
      .eq("strava_id", athleteId);
  }

  session.destroy();

  return NextResponse.json({ success: true });
}
