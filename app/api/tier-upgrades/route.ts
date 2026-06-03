import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { getMonthKey, getNextMonthStart, getNextTier } from "@/lib/challenge";
import { Tier } from "@/lib/types";
import { applyDueTierUpgrades } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  await applyDueTierUpgrades(db, userId);

  const { data: user, error: userError } = await db
    .from("users")
    .select("strava_id,name,tier")
    .eq("strava_id", userId)
    .maybeSingle();

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const currentTier = Number(user.tier) as Tier;
  const requestedTier = getNextTier(currentTier);
  if (!requestedTier) return NextResponse.json({ error: "no_next_tier" }, { status: 422 });

  const body = await req.json().catch(() => ({}));
  if (body.requestedTier !== undefined && Number(body.requestedTier) !== requestedTier) {
    return NextResponse.json({ error: "invalid_requested_tier" }, { status: 400 });
  }

  const now = new Date();
  const rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();
  const { data: activities, error: activitiesError } = await db
    .from("activities")
    .select("distance")
    .eq("user_strava_id", userId)
    .gte("date", rangeStart)
    .lt("date", rangeEnd);

  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  const monthlyKm = Math.round((activities ?? []).reduce((sum, activity) => sum + Number(activity.distance), 0) / 1000);
  if (monthlyKm < currentTier) {
    return NextResponse.json({ error: "current_tier_not_complete", monthlyKm }, { status: 422 });
  }

  const effectiveOn = getNextMonthStart(now).toISOString().slice(0, 10);
  const { data: request, error } = await db
    .from("tier_upgrade_requests")
    .insert({
      user_strava_id: userId,
      current_tier: currentTier,
      requested_tier: requestedTier,
      month_key: getMonthKey(now),
      monthly_km: monthlyKm,
      effective_on: effectiveOn,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "upgrade_request_already_pending" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await db.from("notifications").insert({
    user_strava_id: userId,
    type: "info",
    title: "League upgrade requested",
    body: `Your request to move from ${currentTier} km to ${requestedTier} km has been sent for admin approval.`,
  });

  const { data: admins } = await db.from("users").select("strava_id").eq("role", "admin");
  const adminRows = (admins ?? []).map((admin) => ({
    user_strava_id: admin.strava_id,
    type: "info",
    title: "League upgrade pending",
    body: `${user.name} requested ${requestedTier} km after riding ${monthlyKm} km this month.`,
  }));
  if (adminRows.length) await db.from("notifications").insert(adminRows);

  return NextResponse.json({ request }, { status: 201 });
}
