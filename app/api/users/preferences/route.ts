import { NextRequest, NextResponse } from "next/server";
import { getSession, getStravaUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const userId = getStravaUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, boolean | string> = {
    updated_at: new Date().toISOString(),
  };

  if (body.leaderboardConsent !== undefined) {
    update.leaderboard_consent = body.leaderboardConsent === true;
  }
  if (body.rewardsExportConsent !== undefined) {
    update.rewards_export_consent = body.rewardsExportConsent === true;
  }
  if (typeof body.zone === "string") {
    update.zone = body.zone.trim();
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "No preferences to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("users")
    .update(update)
    .eq("strava_id", userId)
    .select("leaderboard_consent,rewards_export_consent,zone")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    leaderboardConsent: data.leaderboard_consent === true,
    rewardsExportConsent: data.rewards_export_consent === true,
    zone: data.zone ?? null,
  });
}
