import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { Tier, UserRole } from "@/lib/types";
import { founderDefaults, founderRepairTier, isFounderUserId } from "@/lib/founder";

export const VALID_ROLES: UserRole[] = ["member", "champion", "admin"];
export const VALID_TIERS: Tier[] = [200, 400, 600, 800, 1000];

const CALLER_COLUMNS =
  "strava_id,name,role,tier,zone,leaderboard_consent,rewards_export_consent,last_strava_sync_at";

export async function getAdminContext() {
  const session = await getSession();
  const identity = getEffectiveUserId(session);
  if (!identity) return { error: "Unauthorized" as const, status: 401 as const };

  const db = supabaseAdmin();

  // Email sign-in puts the Supabase auth id in the session while Strava
  // sign-in puts an athlete id, and one person can hold both. Resolve the
  // auth link first and fall back to strava_id, so an admin who signed in by
  // email lands on the same profile as when they sign in through Strava.
  const linked = await db.from("users").select(CALLER_COLUMNS).eq("auth_user_id", identity).maybeSingle();
  if (linked.error) return { error: linked.error.message, status: 500 as const };

  let caller = linked.data;
  if (!caller) {
    const byStravaId = await db.from("users").select(CALLER_COLUMNS).eq("strava_id", identity).maybeSingle();
    if (byStravaId.error) return { error: byStravaId.error.message, status: 500 as const };
    caller = byStravaId.data;
  }

  // Callers treat this as a strava_id -- it is written to attributed_by, which
  // is a foreign key into users.strava_id -- so hand back the resolved
  // profile's id rather than whichever identity happened to open the session.
  const userId = caller?.strava_id ?? identity;

  if (caller && isFounderUserId(caller.strava_id) && caller.role !== "admin") {
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
      .select(CALLER_COLUMNS)
      .maybeSingle();

    if (repairError) return { error: repairError.message, status: 500 as const };
    caller = repairedCaller ?? { ...caller, role: founder.role, tier: founderRepairTier(caller.tier), zone: founder.zone };
  }

  if (caller?.role !== "admin") return { error: "Forbidden" as const, status: 403 as const };

  return { db, userId, caller };
}
