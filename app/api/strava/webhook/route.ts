import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getStravaActivityById } from "@/lib/strava";
import { getFreshStravaAccessToken } from "@/lib/strava-tokens";
import { detectZoneFromGPS } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Invalid verification request" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const event = await req.json().catch(() => null);
  if (!event?.owner_id || !event?.object_id || event.object_type !== "activity") {
    return NextResponse.json({ received: true });
  }

  const db = supabaseAdmin();
  const athleteId = String(event.owner_id);

  if (event.aspect_type === "delete") {
    await db
      .from("champion_sessions")
      .delete()
      .eq("user_strava_id", athleteId)
      .eq("strava_activity_id", String(event.object_id));

    await db
      .from("activities")
      .delete()
      .eq("user_strava_id", athleteId)
      .eq("strava_id", String(event.object_id));
  } else if (event.aspect_type === "create" || event.aspect_type === "update") {
    const accessToken = await getFreshStravaAccessToken(Number(event.owner_id));
    if (accessToken) {
      try {
        const activity = await getStravaActivityById(accessToken, event.object_id);
        const lat = activity.start_latlng?.[0];
        const lng = activity.start_latlng?.[1];
        await db.from("activities").upsert(
          {
            strava_id: String(activity.id),
            user_strava_id: athleteId,
            name: activity.name,
            distance: activity.distance,
            elevation_gain: activity.total_elevation_gain ?? 0,
            moving_time: activity.moving_time,
            type: activity.type,
            date: activity.start_date,
            kudos: activity.kudos_count,
            detected_zone_id: detectZoneFromGPS(lat, lng),
          },
          { onConflict: "strava_id" }
        );
      } catch (error) {
        console.warn("Strava webhook activity sync failed:", error);
      }
    }
  }

  await db
    .from("users")
    .update({
      last_strava_sync_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", athleteId);

  return NextResponse.json({ received: true });
}
