import { NextRequest, NextResponse } from "next/server";
import { getLeaderboardMonthRange } from "@/lib/leaderboard";
import { getEffectiveUserId, getSession } from "@/lib/session";
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
  team_id: string | null;
  tier: number | null;
  current_league_threshold: number | null;
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

async function buildTeamsResponse(userId: string) {
  const db = supabaseAdmin();
  const now = new Date();
  const { rangeStart, rangeEnd } = getLeaderboardMonthRange(now);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [teamsResult, usersResult, activitiesResult, promotionsResult] = await Promise.all([
    db.from("teams").select("id,name,slug,logo_url,banner_url,description").order("name", { ascending: true }),
    db
      .from("users")
      .select("strava_id,name,avatar,team_id,tier,current_league_threshold")
      .eq("onboarded", true),
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
  if (activitiesResult.error) throw activitiesResult.error;
  if (promotionsResult.error) throw promotionsResult.error;

  const users = (usersResult.data ?? []) as UserRow[];
  const teams = (teamsResult.data ?? []) as TeamRow[];
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const userById = new Map(users.map((user) => [String(user.strava_id), user]));
  const statsByTeam = new Map<string, {
    totalMetres: number;
    totalElevation: number;
    activeRiders: Set<string>;
  }>();

  for (const activity of (activitiesResult.data ?? []) as ActivityRow[]) {
    if (!isCycling(activity.type)) continue;
    const user = userById.get(String(activity.user_strava_id));
    if (!user?.team_id || !teamById.has(user.team_id)) continue;
    const current = statsByTeam.get(user.team_id) ?? {
      totalMetres: 0,
      totalElevation: 0,
      activeRiders: new Set<string>(),
    };
    current.totalMetres += Number(activity.distance ?? 0);
    current.totalElevation += Number(activity.elevation_gain ?? 0);
    current.activeRiders.add(String(activity.user_strava_id));
    statsByTeam.set(user.team_id, current);
  }

  const promotionsByTeam = new Map<string, number>();
  for (const promotion of promotionsResult.data ?? []) {
    const user = userById.get(String(promotion.user_strava_id));
    if (!user?.team_id) continue;
    promotionsByTeam.set(user.team_id, (promotionsByTeam.get(user.team_id) ?? 0) + 1);
  }

  const currentUser = userById.get(userId);
  const decorated = teams.map((team) => {
    const members = users.filter((user) => user.team_id === team.id);
    const averageLeagueLevel = members.length
      ? Math.round(members.reduce((sum, user) => sum + Number(user.current_league_threshold ?? user.tier ?? 200), 0) / members.length)
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
      isCurrentUserTeam: currentUser?.team_id === team.id,
      members: members.slice(0, 8).map((member) => ({
        id: member.strava_id,
        name: member.name ?? "SpinTribe rider",
        avatar: member.avatar,
        leagueLevel: Number(member.current_league_threshold ?? member.tier ?? 200),
      })),
    };
  });

  return {
    monthKey,
    currentUserTeamId: currentUser?.team_id ?? null,
    teams: decorated.sort((a, b) =>
      b.averageLeagueLevel - a.averageLeagueLevel ||
      b.ridersPromoted - a.ridersPromoted ||
      b.totalDistanceKm - a.totalDistanceKm ||
      a.name.localeCompare(b.name)
    ),
  };
}

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await buildTeamsResponse(userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const { data, error } = await db
      .from("teams")
      .insert({
        name,
        slug,
        description: String(body.description ?? "").trim(),
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await db.from("users").update({ team_id: data.id, updated_at: new Date().toISOString() }).eq("strava_id", userId);
    return NextResponse.json(await buildTeamsResponse(userId));
  }

  if (action === "join") {
    const teamId = String(body.teamId ?? "");
    if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    const { error } = await db
      .from("users")
      .update({ team_id: teamId, updated_at: new Date().toISOString() })
      .eq("strava_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await buildTeamsResponse(userId));
  }

  if (action === "leave") {
    const { error } = await db
      .from("users")
      .update({ team_id: null, updated_at: new Date().toISOString() })
      .eq("strava_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await buildTeamsResponse(userId));
  }

  return NextResponse.json({ error: "Unknown team action" }, { status: 400 });
}
