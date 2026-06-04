import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getEffectiveUserId } from "@/lib/session";
import { UserRole } from "@/lib/types";
import { founderDefaults, founderRepairTier, isFounderUserId } from "@/lib/founder";

const VALID_ROLES = ["champion", "member"];
const VALID_TIERS = [200, 400, 600, 800, 1000];

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { role, tier, zone, region, leaderboardConsent, rewardsExportConsent } = body;

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Validate tier
  if (!VALID_TIERS.includes(Number(tier))) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existingUser, error: existingUserError } = await db
    .from("users")
    .select("role,zone")
    .eq("strava_id", userId)
    .maybeSingle();

  if (existingUserError) {
    console.error("Onboard lookup error:", existingUserError);
    return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
  }

  // Founder/admin is an overlay role. If an admin is forced back through
  // onboarding, keep admin privileges while updating league/consent/zone.
  const existingRole = existingUser?.role as UserRole | undefined;
  const isFounder = isFounderUserId(userId);
  const founder = founderDefaults();
  const roleForUpdate: UserRole = existingRole === "admin" || isFounder ? "admin" : role;
  const tierForUpdate = isFounder ? founderRepairTier(tier) : Number(tier);

  // Champions and admins require a champ zone. Preserve the existing zone when
  // a returning admin accidentally lands on onboarding after logout/login.
  const needsZone = role === "champion" || roleForUpdate === "admin";
  const submittedZone = zone?.trim();
  const existingZone = existingUser?.zone?.trim();
  const effectiveZone: string | null = needsZone
    ? (
        isFounder && existingRole !== "admin"
          ? founder.zone
          : submittedZone || existingZone || (isFounder ? founder.zone : null)
      )
    : (submittedZone || region?.trim() || existingZone || null);

  if (needsZone && !effectiveZone) {
    return NextResponse.json({ error: "Zone is required for champions" }, { status: 400 });
  }

  // Update user record
  const { error: updateError } = await db
    .from("users")
    .update({
      role: roleForUpdate,
      tier: tierForUpdate,
      zone: effectiveZone,
      onboarded: true,
      leaderboard_consent: leaderboardConsent === true,
      rewards_export_consent: rewardsExportConsent === true,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", userId);

  if (updateError) {
    console.error("Onboard update error:", updateError);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  // Create welcome notification
  const welcomeBody = `Here's how to get started: 1) Sync your Strava rides to track monthly km. 2) Check the leaderboard to see how you rank. 3) Champions: log champing check-ins only when a ride was actually champing. Your goal is ${tier}km this month - let's go!`;

  const { error: notifError } = await db.from("notifications").insert({
    user_strava_id: userId,
    type: "welcome",
    title: "Welcome to spera!",
    body: welcomeBody,
  });

  if (notifError) {
    console.warn("Failed to create welcome notification:", notifError);
    // Non-fatal — continue
  }

  return NextResponse.json({ ok: true });
}
