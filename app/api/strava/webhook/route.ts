import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
      .from("activities")
      .delete()
      .eq("user_strava_id", athleteId)
      .eq("strava_id", String(event.object_id));
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
