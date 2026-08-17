import { NextRequest, NextResponse } from "next/server";
import { getAdminContext, VALID_ROLES, VALID_TIERS } from "@/lib/admin-auth";
import { Tier } from "@/lib/types";

// PATCH /api/admin/users/:id - update platform role/tier. The legacy
// "champion" UI choice is translated into Team Vitality membership and is never
// stored in users.role.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    if (body.role === "champion" || body.role === "member") {
      const { data: vitality, error: vitalityError } = await ctx.db
        .from("teams")
        .select("id")
        .eq("slug", "team-vitality")
        .maybeSingle();
      if (vitalityError) return NextResponse.json({ error: vitalityError.message }, { status: 500 });
      if (!vitality) return NextResponse.json({ error: "Team Vitality club setup is missing." }, { status: 500 });

      const { data: existingMembership, error: membershipLookupError } = await ctx.db
        .from("team_memberships")
        .select("is_primary")
        .eq("user_strava_id", id)
        .eq("team_id", vitality.id)
        .maybeSingle();
      if (membershipLookupError) return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });

      if (body.role === "champion") {
        const { count: primaryCount, error: primaryCountError } = await ctx.db
          .from("team_memberships")
          .select("id", { count: "exact", head: true })
          .eq("user_strava_id", id)
          .eq("is_primary", true);
        if (primaryCountError) return NextResponse.json({ error: primaryCountError.message }, { status: 500 });

        const { error: membershipError } = await ctx.db.from("team_memberships").upsert(
          {
            user_strava_id: id,
            team_id: vitality.id,
            role: "champion",
            is_primary: existingMembership?.is_primary ?? (primaryCount ?? 0) === 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_strava_id,team_id" },
        );
        if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
        update.onboarded = true;
      } else if (existingMembership) {
        const { error: membershipError } = await ctx.db
          .from("team_memberships")
          .update({ role: "member", updated_at: new Date().toISOString() })
          .eq("user_strava_id", id)
          .eq("team_id", vitality.id);
        if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      update.role = "member";
    } else {
      update.role = "admin";
      update.onboarded = true;
    }
  }

  if (body.tier !== undefined) {
    const tier = Number(body.tier);
    if (!VALID_TIERS.includes(tier as Tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    update.tier = tier;
  }
  if (body.leaderboardConsent !== undefined) update.leaderboard_consent = body.leaderboardConsent === true;
  if (body.rewardsExportConsent !== undefined) update.rewards_export_consent = body.rewardsExportConsent === true;
  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { data, error } = await ctx.db
    .from("users")
    .update(update)
    .eq("strava_id", id)
    .select("strava_id,name,avatar,role,tier,onboarded,zone,leaderboard_consent,rewards_export_consent,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: championClubCount } = await ctx.db
    .from("team_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_strava_id", id)
    .eq("role", "champion");

  return NextResponse.json({
    success: true,
    user: { ...data, role: data.role === "admin" ? "admin" : (championClubCount ?? 0) > 0 ? "champion" : "member" },
  });
}
