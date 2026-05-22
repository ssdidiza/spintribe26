import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getEffectiveUserId } from "@/lib/session";

const VALID_ROLES = ["champion", "member"];
const VALID_TIERS = [200, 400, 800, 1000];

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { role, tier, zone, region } = body;

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Validate tier
  if (!VALID_TIERS.includes(Number(tier))) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  // Champions require zone
  const effectiveZone: string | null = role === "champion"
    ? (zone?.trim() || null)
    : (zone?.trim() || region?.trim() || null);

  if (role === "champion" && !effectiveZone) {
    return NextResponse.json({ error: "Zone is required for champions" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Update user record
  const { error: updateError } = await db
    .from("users")
    .update({
      role,
      tier: Number(tier),
      zone: effectiveZone,
      onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", userId);

  if (updateError) {
    console.error("Onboard update error:", updateError);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  // Create welcome notification
  const welcomeBody = `Here's how to get started: 1) Sync your Strava rides to track monthly km. 2) Check the leaderboard to see how you rank. 3) Champions: log champing sessions from the Champion tab. Your goal is ${tier}km this month — let's go!`;

  const { error: notifError } = await db.from("notifications").insert({
    user_strava_id: userId,
    type: "welcome",
    title: "Welcome to SpinTribe 2026! 👋",
    body: welcomeBody,
  });

  if (notifError) {
    console.warn("Failed to create welcome notification:", notifError);
    // Non-fatal — continue
  }

  return NextResponse.json({ ok: true });
}
