import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export type ClubMembershipRole = "member" | "champion";

export type ClubMembership = {
  team_id: string;
  role: ClubMembershipRole;
  is_primary: boolean;
  team: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type SignedInClubUser = {
  stravaId: string;
  name: string | null;
  platformRole: string;
  authUserId: string | null;
  memberships: ClubMembership[];
  isAdmin: boolean;
};

function normalizeJoinedTeam(value: unknown): ClubMembership["team"] {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const team = row as { id?: unknown; name?: unknown; slug?: unknown };
  if (typeof team.id !== "string" || typeof team.name !== "string" || typeof team.slug !== "string") {
    return null;
  }
  return { id: team.id, name: team.name, slug: team.slug };
}

/**
 * Resolve the current iron-session to the canonical users row, then load the
 * user's club memberships. team_memberships is the only authorization source
 * for club roles; users.role is platform-wide only (admin/member).
 */
export async function getSignedInClubUser(): Promise<SignedInClubUser | null> {
  const session = await getSession();
  const db = supabaseAdmin();

  let profile: {
    strava_id: string;
    name: string | null;
    role: string;
    auth_user_id: string | null;
  } | null = null;

  if (session.athleteId) {
    const { data, error } = await db
      .from("users")
      .select("strava_id,name,role,auth_user_id")
      .eq("strava_id", String(session.athleteId))
      .maybeSingle();
    if (error) throw error;
    profile = data;
  }

  if (!profile && session.userId) {
    const { data: linked, error: linkedError } = await db
      .from("users")
      .select("strava_id,name,role,auth_user_id")
      .eq("auth_user_id", session.userId)
      .maybeSingle();
    if (linkedError) throw linkedError;
    profile = linked;

    if (!profile) {
      const { data: direct, error: directError } = await db
        .from("users")
        .select("strava_id,name,role,auth_user_id")
        .eq("strava_id", session.userId)
        .maybeSingle();
      if (directError) throw directError;
      profile = direct;
    }
  }

  if (!profile) return null;

  const { data: membershipRows, error: membershipError } = await db
    .from("team_memberships")
    .select("team_id,role,is_primary,team:teams(id,name,slug)")
    .eq("user_strava_id", profile.strava_id)
    .order("is_primary", { ascending: false });

  if (membershipError) throw membershipError;

  const memberships: ClubMembership[] = (membershipRows ?? []).map((row) => ({
    team_id: String(row.team_id),
    role: row.role as ClubMembershipRole,
    is_primary: Boolean(row.is_primary),
    team: normalizeJoinedTeam(row.team),
  }));

  return {
    stravaId: profile.strava_id,
    name: profile.name,
    platformRole: profile.role,
    authUserId: profile.auth_user_id,
    memberships,
    isAdmin: profile.role === "admin",
  };
}

export function canChampionClub(user: SignedInClubUser, teamId: string): boolean {
  return user.isAdmin || user.memberships.some(
    (membership) => membership.team_id === teamId && membership.role === "champion",
  );
}

export function championMemberships(user: SignedInClubUser): ClubMembership[] {
  return user.memberships.filter((membership) => membership.role === "champion");
}
