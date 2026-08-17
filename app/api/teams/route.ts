import { NextRequest, NextResponse } from "next/server";
import { getSignedInClubUser } from "@/lib/club-auth";
import { getLeaderboardMonthRange } from "@/lib/leaderboard";
import { supabaseAdmin } from "@/lib/supabase";

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
};

type UserRow = {
  strava_id: string;
  name: string | null;
  avatar: string | null;
  tier: number | null;
  current_league_threshold: number | null;
};

type MembershipRow = {
  user_strava_id: string;
  team_id: string;
  role: "member" | "champion";
  is_primary: boolean;
};

type ActivityRow = {
  user_strava_id: string;
  distance: number | string | null;
  elevation_gain: number | string | null;
  type: string | null;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isCycling(type: string | null) {
  return type === "Ride" || type === "VirtualRide" || type === "EBikeRide" || type === "Velomobile";
}

async function syncPrimaryTeamMirror(userId: string, teamId: string | null) {
  const { error } = await supabaseAdmin()
    .from("users")
    .update({ team_id: teamId, updated_at: new Date().toISOString() })
    .eq("strava_id", userId);
  if (error) throw error;
}

async function buildTeamsResponse(userId: string) {
  const db = supabaseAdmin();
  const now = new Date();
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(now);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [teamsResult, usersResult, membershipsResult, activitiesResult, promotionsResult] = await Promise.all([
    db.from("teams").select("id,name,slug,logo_url,banner_url,description").order("name", { ascending: true }),
    db
      .from("users")
      .select("strava_id,name,avatar,tier,current_league_threshold")
      .eq("onboarded", true)
      .eq("leaderboard_consent", true),
    db.from("team_memberships").select("user_strava_id,team_id,role,is_primary"),
    db
      .from("activities")
      .select("user_strava_id,distance,elevation_gain,type")
      .gte("date", rangeStart)
      .lt("date", rangeEnd),
    db
      .from("league_memberships")
      .select("user_strava_id,promoted_from_league_id")
      .eq("month_key", monthKey)
      .not("promoted_from_league_id", "is", null),
  ]);

  if (teamsResult.error) throw teamsResult.error;
  if (usersResult.error) throw usersResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  if (promotionsResult.error) throw promotionsResult.error;

  const users = (usersResult.data ?? []) as UserRow[];
  const teams = (teamsResult.data ?? []) as TeamRow[];
  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const userById = new Map(users.map((user) => [String(user.strava_id), user]));

  // One membership may be marked primary for leaderboard attribution. A user
  // may still belong to and champion several clubs; authorization never reads
  // users.team_id or assumes that only the primary membership exists.
  const primaryTeamByUser = new Map<string, string>();
  for (const membership of memberships) {
    if (membership.is_primary && teamById.has(membership.team_id)) {
      primaryTeamByUser.set(String(membership.user_strava_id), membership.team_id);
    }
  }

  const statsByTeam = new Map<string, {
    totalMetres: number;
    totalElevation: number;
    activeRiders: Set<string>;
  }>();
  const metresByUser = new Map<string, number>();
  const unassignedStats = { totalMetres: 0, totalElevation: 0, activeRiders: new Set<string>() };

  for (const activity of (activitiesResult.data ?? []) as ActivityRow[]) {
    if (!isCycling(activity.type)) continue;
    const riderId = String(activity.user_strava_id);
    const user = userById.get(riderId);
    if (!user) continue;

    const distance = Number(activity.distance ?? 0);
    metresByUser.set(riderId, (metresByUser.get(riderId) ?? 0) + distance);
    const primaryTeamId = primaryTeamByUser.get(riderId);

    if (!primaryTeamId) {
      unassignedStats.totalMetres += distance;
      unassignedStats.totalElevation += Number(activity.elevation_gain ?? 0);
      unassignedStats.activeRiders.add(riderId);
      continue;
    }

    const current = statsByTeam.get(primaryTeamId) ?? {
      totalMetres: 0,
      totalElevation: 0,
      activeRiders: new Set<string>(),
    };
    current.totalMetres += distance;
    current.totalElevation += Number(activity.elevation_gain ?? 0);
    current.activeRiders.add(riderId);
    statsByTeam.set(primaryTeamId, current);
  }

  const promotionsByTeam = new Map<string, number>();
  for (const promotion of promotionsResult.data ?? []) {
    const riderId = String(promotion.user_strava_id);
    const primaryTeamId = primaryTeamByUser.get(riderId);
    if (!primaryTeamId) continue;
    promotionsByTeam.set(primaryTeamId, (promotionsByTeam.get(primaryTeamId) ?? 0) + 1);
  }

  const currentUserTeamId = primaryTeamByUser.get(userId) ?? null;

  const decorated = teams.map((team) => {
    const members = users.filter((user) => primaryTeamByUser.get(String(user.strava_id)) === team.id);
    const averageLeagueLevel = members.length
      ? Math.round(
          members.reduce(
            (sum, user) => sum + Number(user.current_league_threshold ?? user.tier ?? 200),
            0,
          ) / members.length,
        )
      : 0;
    const stats = statsByTeam.get(team.id);

    return {
      ...team,
      memberCount: members.length,
      averageLeagueLevel,
      ridersPromoted: promotionsByTeam.get(team.id) ?? 0,
      totalDistanceKm: Math.round((stats?.totalMetres ?? 0) / 1000),
      totalElevation: Math.round(stats?.totalElevation ?? 0),
      activeRiders: stats?.activeRiders.size ?? 0,
      isCurrentUserTeam: currentUserTeamId === team.id,
      currentUserMembership: memberships.find(
        (membership) => membership.user_strava_id === userId && membership.team_id === team.id,
      ) ?? null,
    };
  });

  const unassignedUsers = users.filter((user) => !primaryTeamByUser.has(String(user.strava_id)));
  const unassigned = {
    count: unassignedUsers.length,
    totalDistanceKm: Math.round(unassignedStats.totalMetres / 1000),
    totalElevation: Math.round(unassignedStats.totalElevation),
    activeRiders: unassignedStats.activeRiders.size,
    riders: unassignedUsers
      .map((user) => {
        const isViewer = String(user.strava_id) === userId;
        return {
          isViewer,
          realId: String(user.strava_id),
          name: isViewer ? (user.name ?? "You") : "Rider",
          avatar: isViewer ? user.avatar : null,
          leagueLevel: Number(user.current_league_threshold ?? user.tier ?? 200),
          monthlyKm: Math.round((metresByUser.get(String(user.strava_id)) ?? 0) / 1000),
        };
      })
      .sort((a, b) => b.monthlyKm - a.monthlyKm || a.name.localeCompare(b.name))
      .slice(0, 12)
      .map((rider, index) => ({
        id: rider.isViewer ? rider.realId : `rider-${index}`,
        name: rider.name,
        avatar: rider.avatar,
        leagueLevel: rider.leagueLevel,
        monthlyKm: rider.monthlyKm,
      })),
  };

  return {
    monthKey,
    currentUserTeamId,
    teams: decorated.sort((a, b) =>
      b.averageLeagueLevel - a.averageLeagueLevel ||
      b.ridersPromoted - a.ridersPromoted ||
      b.totalDistanceKm - a.totalDistanceKm ||
      a.name.localeCompare(b.name),
    ),
    unassigned,
  };
}

export async function GET() {
  try {
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await buildTeamsResponse(user.stravaId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSignedInClubUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.stravaId;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const db = supabaseAdmin();

  if (action === "create") {
    const name = String(body.name ?? "").trim();
    if (name.length < 3 || name.length > 80) {
      return NextResponse.json({ error: "Team name must be 3-80 characters" }, { status: 400 });
    }
    const slug = slugify(body.slug ? String(body.slug) : name);
    if (!slug) return NextResponse.json({ error: "Invalid team slug" }, { status: 400 });

    const [{ data: creator, error: creatorError }, { count: createdCount, error: createdCountError }, { count: primaryCount, error: primaryCountError }] = await Promise.all([
      db.from("users").select("strava_id,onboarded").eq("strava_id", userId).maybeSingle(),
      db.from("teams").select("id", { count: "exact", head: true }).eq("created_by", userId),
      db.from("team_memberships").select("id", { count: "exact", head: true }).eq("user_strava_id", userId).eq("is_primary", true),
    ]);

    if (creatorError) return NextResponse.json({ error: creatorError.message }, { status: 500 });
    if (createdCountError) return NextResponse.json({ error: createdCountError.message }, { status: 500 });
    if (primaryCountError) return NextResponse.json({ error: primaryCountError.message }, { status: 500 });
    if (!creator?.onboarded) return NextResponse.json({ error: "Finish onboarding before creating a team" }, { status: 403 });
    if ((createdCount ?? 0) >= 1) return NextResponse.json({ error: "You already created a team. Each rider can create one team." }, { status: 409 });
    if ((primaryCount ?? 0) > 0) return NextResponse.json({ error: "Leave your primary team before creating a new one" }, { status: 409 });

    const { data: team, error: createError } = await db
      .from("teams")
      .insert({
        name,
        slug,
        description: String(body.description ?? "").trim().slice(0, 280),
        created_by: userId,
      })
      .select("id")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        return NextResponse.json({ error: "A team with that name already exists. Join it instead." }, { status: 409 });
      }
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const { error: membershipError } = await db.from("team_memberships").insert({
      user_strava_id: userId,
      team_id: team.id,
      role: "champion",
      is_primary: true,
    });
    if (membershipError) {
      await db.from("teams").delete().eq("id", team.id).eq("created_by", userId);
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    await syncPrimaryTeamMirror(userId, team.id);
    return NextResponse.json(await buildTeamsResponse(userId));
  }

  if (action === "join") {
    const teamId = String(body.teamId ?? "");
    if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

    const [{ data: team, error: teamLookupError }, { data: existingMembership, error: membershipLookupError }] = await Promise.all([
      db.from("teams").select("id").eq("id", teamId).maybeSingle(),
      db.from("team_memberships").select("role").eq("user_strava_id", userId).eq("team_id", teamId).maybeSingle(),
    ]);

    if (teamLookupError) return NextResponse.json({ error: "Invalid team" }, { status: 400 });
    if (membershipLookupError) return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const { error: clearPrimaryError } = await db
      .from("team_memberships")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("user_strava_id", userId)
      .eq("is_primary", true);
    if (clearPrimaryError) return NextResponse.json({ error: clearPrimaryError.message }, { status: 500 });

    const { error: joinError } = await db.from("team_memberships").upsert(
      {
        user_strava_id: userId,
        team_id: team.id,
        role: existingMembership?.role ?? "member",
        is_primary: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_strava_id,team_id" },
    );
    if (joinError) return NextResponse.json({ error: joinError.message }, { status: 500 });

    await syncPrimaryTeamMirror(userId, team.id);
    return NextResponse.json(await buildTeamsResponse(userId));
  }

  if (action === "leave") {
    const { data: primaryMembership, error: primaryLookupError } = await db
      .from("team_memberships")
      .select("team_id")
      .eq("user_strava_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (primaryLookupError) return NextResponse.json({ error: primaryLookupError.message }, { status: 500 });

    if (primaryMembership) {
      const { error: leaveError } = await db
        .from("team_memberships")
        .delete()
        .eq("user_strava_id", userId)
        .eq("team_id", primaryMembership.team_id);
      if (leaveError) return NextResponse.json({ error: leaveError.message }, { status: 500 });
    }

    await syncPrimaryTeamMirror(userId, null);
    return NextResponse.json(await buildTeamsResponse(userId));
  }

  return NextResponse.json({ error: "Unknown team action" }, { status: 400 });
}
