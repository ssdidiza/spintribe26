import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getEffectiveUserId } from "@/lib/session";
import { UserRole } from "@/lib/types";
import { founderDefaults, founderRepairTier, isFounderUserId } from "@/lib/founder";
import { getLeagueByTier, getNextLeague } from "@/lib/leagues";

const VALID_ROLES = ["champion", "member"];

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { role, zone, region, leaderboardConsent, rewardsExportConsent } = body;
  const leaderboardOptIn = leaderboardConsent !== false;
  const rewardsOptIn = rewardsExportConsent !== false;

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existingUser, error: existingUserError } = await db
    .from("users")
    .select("role,zone,current_league_threshold")
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

  // League-only model: there is no chosen tier. Every new rider starts in the
  // 200 Club and earns higher clubs through verified Strava distance
  // (fast-track in-month, cron at month-end). Founders keep their configured
  // starting club, and re-running onboarding never demotes an already-placed
  // rider (leagues are earned, not reset).
  const baselineThreshold = isFounder ? founderRepairTier(200) : 200;
  const effectiveThreshold =
    Math.max(baselineThreshold, Number(existingUser?.current_league_threshold ?? 0)) || 200;
  const league = getLeagueByTier(effectiveThreshold);
  const { data: leagueRow } = await db
    .from("leagues")
    .select("id")
    .eq("name", league.name)
    .maybeSingle();

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
      tier: league.tier,
      current_league_id: leagueRow?.id ?? null,
      current_league_name: league.name,
      current_league_threshold: league.tier,
      zone: effectiveZone,
      onboarded: true,
      leaderboard_consent: leaderboardOptIn,
      rewards_export_consent: rewardsOptIn,
      updated_at: new Date().toISOString(),
    })
    .eq("strava_id", userId);

  if (updateError) {
    console.error("Onboard update error:", updateError);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  // Create welcome notification (league-first copy).
  const nextLeague = getNextLeague(league.tier);
  const welcomeBody = nextLeague
    ? `You're starting in the ${league.name}. Sync your Strava rides to track this month's distance — cross ${nextLeague.minKm} km and you'll be fast-tracked straight into the ${nextLeague.name}.`
    : `You're in the ${league.name}, the top league. Sync your Strava rides and keep your monthly distance high to hold your standing.`;

  const { error: notifError } = await db.from("notifications").insert({
    user_strava_id: userId,
    type: "welcome",
    title: "Welcome to SpinTribe!",
    body: welcomeBody,
  });

  if (notifError) {
    console.warn("Failed to create welcome notification:", notifError);
    // Non-fatal — continue
  }

  return NextResponse.json({ ok: true });
}
