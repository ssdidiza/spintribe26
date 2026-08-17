import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getStravaUserId } from "@/lib/session";
import { UserRole } from "@/lib/types";
import { founderDefaults, founderRepairTier, isFounderUserId } from "@/lib/founder";
import { getLeagueByTier, getNextLeague } from "@/lib/leagues";

const VALID_ROLES = ["champion", "member"];

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const userId = getStravaUserId(session);

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { role, zone, region, leaderboardConsent, rewardsExportConsent } = body;
  const leaderboardOptIn = leaderboardConsent !== false;
  const rewardsOptIn = rewardsExportConsent !== false;

  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const db = supabaseAdmin();
  const [{ data: existingUser, error: existingUserError }, { data: vitality, error: vitalityError }] = await Promise.all([
    db.from("users").select("role,zone,current_league_threshold").eq("strava_id", userId).maybeSingle(),
    db.from("teams").select("id").eq("slug", "team-vitality").maybeSingle(),
  ]);

  if (existingUserError) {
    console.error("Onboard lookup error:", existingUserError);
    return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
  }
  if (vitalityError) return NextResponse.json({ error: vitalityError.message }, { status: 500 });
  if (!vitality) return NextResponse.json({ error: "Team Vitality club setup is missing." }, { status: 500 });

  // Global role is platform-wide only. The onboarding "Champion" choice means
  // Team Vitality club role; it is persisted in team_memberships below.
  const existingRole = existingUser?.role as UserRole | undefined;
  const isFounder = isFounderUserId(userId);
  const founder = founderDefaults();
  const roleForUpdate: UserRole = existingRole === "admin" || isFounder ? "admin" : "member";

  const baselineThreshold = isFounder ? founderRepairTier(200) : 200;
  const effectiveThreshold = Math.max(baselineThreshold, Number(existingUser?.current_league_threshold ?? 0)) || 200;
  const league = getLeagueByTier(effectiveThreshold);
  const { data: leagueRow } = await db.from("leagues").select("id").eq("name", league.name).maybeSingle();

  const needsZone = role === "champion" || roleForUpdate === "admin";
  const submittedZone = zone?.trim();
  const existingZone = existingUser?.zone?.trim();
  const effectiveZone: string | null = needsZone
    ? (isFounder && existingRole !== "admin" ? founder.zone : submittedZone || existingZone || (isFounder ? founder.zone : null))
    : (submittedZone || region?.trim() || existingZone || null);

  if (needsZone && !effectiveZone) {
    return NextResponse.json({ error: "Zone is required for champions" }, { status: 400 });
  }

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

  const { data: existingMembership, error: membershipLookupError } = await db
    .from("team_memberships")
    .select("role,is_primary")
    .eq("user_strava_id", userId)
    .eq("team_id", vitality.id)
    .maybeSingle();
  if (membershipLookupError) return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });

  const { count: primaryCount, error: primaryCountError } = await db
    .from("team_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_strava_id", userId)
    .eq("is_primary", true);
  if (primaryCountError) return NextResponse.json({ error: primaryCountError.message }, { status: 500 });

  const clubRole = role === "champion" || existingMembership?.role === "champion" ? "champion" : "member";
  const { error: membershipError } = await db.from("team_memberships").upsert(
    {
      user_strava_id: userId,
      team_id: vitality.id,
      role: clubRole,
      is_primary: existingMembership?.is_primary ?? (primaryCount ?? 0) === 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_strava_id,team_id" },
  );
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });

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
  if (notifError) console.warn("Failed to create welcome notification:", notifError);

  return NextResponse.json({ ok: true, platformRole: roleForUpdate, clubRole });
}
