import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { deauthorizeStrava } from "@/lib/strava";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";
import { purgeStravaData } from "@/lib/strava-data";

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

  // Shared purge keeps disconnect and the Strava deauthorization webhook in
  // lockstep (activities + champion sessions removed, tokens cleared).
  await purgeStravaData(db, athleteId);

  if (deleteAccount) {
    await db.from("users").delete().eq("strava_id", athleteId);
  }

  session.destroy();

  return NextResponse.json({ success: true });
}
