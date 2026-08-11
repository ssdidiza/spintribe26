import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { UserRole } from "@/lib/types";

/**
 * Team Vitality membership.
 *
 * Membership IS `users.role = 'champion'`. There is no champs table and no
 * second membership record — see AGENTS.md "Two pillars". The invite code
 * below is an onboarding gate only: it decides who may create an account,
 * never who is a member. Once the row exists with role 'champion', the code
 * is irrelevant to that user forever.
 */

const CHAMP_ROLES: UserRole[] = ["champion", "admin"];

/** True when an invite code is configured at all. Signup is closed without one. */
export function isChampSignupConfigured() {
  return Boolean(process.env.CHAMP_INVITE_CODE?.trim());
}

/**
 * Guards against the empty-code hole: with CHAMP_INVITE_CODE unset, a bare ""
 * submission used to compare equal to "" and pass. Unconfigured now means
 * closed, not open to everyone.
 */
export function isValidChampInviteCode(code: unknown) {
  const expected = process.env.CHAMP_INVITE_CODE?.trim();
  if (!expected) return false;
  if (typeof code !== "string") return false;
  const supplied = code.trim();
  if (!supplied) return false;
  return supplied.toUpperCase() === expected.toUpperCase();
}

export type ChampContext = {
  db: ReturnType<typeof supabaseAdmin>;
  userId: string;
  role: UserRole;
  name: string;
  isAdmin: boolean;
};

/**
 * Resolves the signed-in champ, server-side. Mirrors getAdminContext():
 * the client store's `role` is display state only and is never trusted here.
 */
export async function getChampContext(): Promise<
  ChampContext | { error: string; status: 401 | 403 | 500 }
> {
  const userId = getEffectiveUserId(await getSession());
  if (!userId) return { error: "Unauthorized", status: 401 };

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("strava_id,name,role")
    .eq("strava_id", userId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };

  const role = (data?.role ?? "member") as UserRole;
  if (!data || !CHAMP_ROLES.includes(role)) {
    return { error: "Team Vitality membership required", status: 403 };
  }

  return { db, userId, role, name: data.name ?? "Rider", isAdmin: role === "admin" };
}

/** Non-throwing viewer lookup for public pages: who is this, if anyone? */
export async function getViewerContext() {
  const userId = getEffectiveUserId(await getSession());
  if (!userId) return { userId: null, isChamp: false, isAdmin: false };

  const { data } = await supabaseAdmin()
    .from("users")
    .select("strava_id,role")
    .eq("strava_id", userId)
    .maybeSingle();

  const role = (data?.role ?? "member") as UserRole;
  return {
    userId: data ? userId : null,
    isChamp: Boolean(data) && CHAMP_ROLES.includes(role),
    isAdmin: role === "admin",
  };
}
