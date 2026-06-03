import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { Tier, UserRole } from "@/lib/types";
import { founderDefaults, founderRepairTier, isFounderUserId } from "@/lib/founder";

export const VALID_ROLES: UserRole[] = ["member", "champion", "admin"];
export const VALID_TIERS: Tier[] = [200, 400, 600, 800, 1000];

export async function getAdminContext() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return { error: "Unauthorized" as const, status: 401 as const };

  const db = supabaseAdmin();
  const callerResult = await db
    .from("users")
    .select("strava_id,name,role,tier,zone,leaderboard_consent,rewards_export_consent,last_strava_sync_at")
    .eq("strava_id", userId)
    .maybeSingle();
  let caller = callerResult.data;

  if (callerResult.error) return { error: callerResult.error.message, status: 500 as const };
  if (caller && isFounderUserId(userId) && caller.role !== "admin") {
    const founder = founderDefaults();
    const { data: repairedCaller, error: repairError } = await db
      .from("users")
      .update({
        role: founder.role,
        tier: founderRepairTier(caller.tier),
        zone: founder.zone,
        onboarded: true,
        updated_at: new Date().toISOString(),
      })
      .eq("strava_id", userId)
      .select("strava_id,name,role,tier,zone,leaderboard_consent,rewards_export_consent,last_strava_sync_at")
      .maybeSingle();

    if (repairError) return { error: repairError.message, status: 500 as const };
    caller = repairedCaller ?? { ...caller, role: founder.role, tier: founderRepairTier(caller.tier), zone: founder.zone };
  }

  if (caller?.role !== "admin") return { error: "Forbidden" as const, status: 403 as const };

  return { db, userId, caller };
}

export async function applyDueTierUpgrades(
  db: ReturnType<typeof supabaseAdmin>,
  userId?: string
) {
  const today = new Date().toISOString().slice(0, 10);
  let query = db
    .from("tier_upgrade_requests")
    .select("id,user_strava_id,requested_tier")
    .eq("status", "approved")
    .is("applied_at", null)
    .lte("effective_on", today);

  if (userId) query = query.eq("user_strava_id", userId);

  const { data: due, error } = await query;
  if (error || !due?.length) return;

  await Promise.all(
    due.map(async (request) => {
      await db
        .from("users")
        .update({ tier: Number(request.requested_tier), updated_at: new Date().toISOString() })
        .eq("strava_id", request.user_strava_id);

      await db
        .from("tier_upgrade_requests")
        .update({ applied_at: new Date().toISOString() })
        .eq("id", request.id);
    })
  );
}
