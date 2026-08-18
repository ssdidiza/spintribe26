import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getStravaUserId } from "@/lib/session";
import { type UserRole } from "@/lib/types";
import { isFounderUserId } from "@/lib/founder";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const userId = getStravaUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: existingUser, error: existingUserError } = await db
    .from("users")
    .select("role")
    .eq("strava_id", userId)
    .maybeSingle();

  if (existingUserError) {
    console.error("Onboard lookup error:", existingUserError);
    return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
  }

  const existingRole = existingUser?.role as UserRole | undefined;
  const roleForUpdate: UserRole =
    existingRole === "admin" || isFounderUserId(userId) ? "admin" : "member";
  const requestedPrivateProgress =
    body.leaderboardConsent === false && body.rewardsExportConsent === false;

  if (!requestedPrivateProgress) {
    return NextResponse.json({ error: "Progress must remain private during setup" }, { status: 400 });
  }

  const { error: updateError } = await db
    .from("users")
    .update({
      role: roleForUpdate,
      onboarded: true,
      leaderboard_consent: false,
      rewards_export_consent: false,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", userId);

  if (updateError) {
    console.error("Onboard update error:", updateError);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  const { error: notificationError } = await db.from("notifications").insert({
    user_strava_id: userId,
    type: "welcome",
    title: "Your private progress is ready",
    body: "Your Strava rides now appear in your private monthly progress view. Book coaching whenever you want support.",
  });

  if (notificationError) {
    console.warn("Failed to create welcome notification:", notificationError);
  }

  return NextResponse.json({ ok: true, role: roleForUpdate });
}
