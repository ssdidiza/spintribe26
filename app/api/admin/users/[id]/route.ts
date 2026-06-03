import { NextRequest, NextResponse } from "next/server";
import { getAdminContext, VALID_ROLES, VALID_TIERS } from "@/lib/admin-auth";
import { Tier } from "@/lib/types";

// PATCH /api/admin/users/:id - update a user's role or tier (admin only).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    update.role = body.role;
  }
  if (body.tier !== undefined) {
    const tier = Number(body.tier);
    if (!VALID_TIERS.includes(tier as Tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    update.tier = tier;
  }
  if (body.leaderboardConsent !== undefined) {
    update.leaderboard_consent = body.leaderboardConsent === true;
  }
  if (body.rewardsExportConsent !== undefined) {
    update.rewards_export_consent = body.rewardsExportConsent === true;
  }
  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("users")
    .update(update)
    .eq("strava_id", id)
    .select("strava_id,name,avatar,role,tier,onboarded,zone,leaderboard_consent,rewards_export_consent,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: data });
}
