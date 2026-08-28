import { NextRequest, NextResponse } from "next/server";
import { championMemberships, getSignedInClubUser } from "@/lib/club-auth";
import {
  isRideCreationError,
  MAX_CHAMP_RIDES_PER_7_DAYS,
  parseRideCreationInput,
  RIDE_CREATION_WINDOW_MS,
} from "@/lib/club-rides";
import { supabaseAdmin } from "@/lib/supabase";

const RIDE_SELECT = "id,starts_at,meeting_point,route,capacity,captain_id,created_by,team_id,team:teams!team_rides_team_id_fkey(id,name,slug),captain:users!team_rides_captain_id_fkey(strava_id,name)";
const PUBLIC_RIDE_SELECT = "id,starts_at,meeting_point,route,capacity,team_id,team:teams!team_rides_team_id_fkey(id,name,slug)";
const PUBLIC_HISTORY_DAYS = 90;

async function countCheckins(db: ReturnType<typeof supabaseAdmin>, rideIds: string[]) {
  const counts = new Map<string, number>();
  if (rideIds.length === 0) return counts;

  const { data, error } = await db.from("ride_checkins").select("ride_id").in("ride_id", rideIds);
  if (error) throw error;
  for (const checkin of data ?? []) {
    const id = String(checkin.ride_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function publicTeamVitalityRides(db: ReturnType<typeof supabaseAdmin>) {
  const { data: vitality, error: vitalityError } = await db
    .from("teams")
    .select("id,name,slug")
    .eq("slug", "team-vitality")
    .maybeSingle();
  if (vitalityError) throw vitalityError;
  if (!vitality) throw new Error("Team Vitality club setup is missing.");

  const since = new Date(Date.now() - PUBLIC_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rides, error } = await db
    .from("team_rides")
    .select(PUBLIC_RIDE_SELECT)
    .eq("team_id", vitality.id)
    .gte("starts_at", since)
    .order("starts_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  const checkins = await countCheckins(db, (rides ?? []).map((ride) => String(ride.id)));
  const now = Date.now();
  const publicRides = (rides ?? []).map((ride) => ({
    ...ride,
    checkinCount: checkins.get(String(ride.id)) ?? 0,
    isPast: new Date(ride.starts_at).getTime() < now,
  }));

  publicRides.sort((left, right) => {
    if (left.isPast !== right.isPast) return left.isPast ? 1 : -1;
    const leftStart = new Date(left.starts_at).getTime();
    const rightStart = new Date(right.starts_at).getTime();
    return left.isPast ? rightStart - leftStart : leftStart - rightStart;
  });

  return NextResponse.json({ rides: publicRides, memberships: [], isAdmin: false, public: true });
}

export async function GET() {
  try {
    const user = await getSignedInClubUser();
    const db = supabaseAdmin();
    if (!user) return publicTeamVitalityRides(db);

    const memberships = championMemberships(user);
    if (!user.isAdmin && memberships.length === 0) {
      return publicTeamVitalityRides(db);
    }

    let query = db
      .from("team_rides")
      .select(RIDE_SELECT)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(20);

    if (!user.isAdmin) {
      query = query.in("team_id", memberships.map((membership) => membership.team_id));
    }

    const { data: rides, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const checkinCounts = await countCheckins(db, (rides ?? []).map((ride) => String(ride.id)));

    return NextResponse.json({
      rides: (rides ?? []).map((ride) => ({
        ...ride,
        checkinCount: checkinCounts.get(String(ride.id)) ?? 0,
        canCancel: !user.isAdmin && ride.created_by === user.stravaId && (checkinCounts.get(String(ride.id)) ?? 0) === 0,
      })),
      memberships,
      isAdmin: user.isAdmin,
      public: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load rides.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (user.isAdmin) {
      return NextResponse.json({ error: "Admins schedule rides from the founder console." }, { status: 403 });
    }

    const input = parseRideCreationInput(await req.json().catch(() => ({})));
    if (isRideCreationError(input)) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }

    const membership = championMemberships(user).find((item) => item.team_id === input.teamId);
    if (!membership) {
      return NextResponse.json({ error: "You are not a champion of this club." }, { status: 403 });
    }

    const db = supabaseAdmin();
    const createdSince = new Date(Date.now() - RIDE_CREATION_WINDOW_MS).toISOString();
    const { count, error: countError } = await db
      .from("team_rides")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.stravaId)
      .gte("created_at", createdSince);

    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) >= MAX_CHAMP_RIDES_PER_7_DAYS) {
      return NextResponse.json(
        { error: `Ride creation is limited to ${MAX_CHAMP_RIDES_PER_7_DAYS} rides per rolling 7 days.` },
        { status: 429 },
      );
    }

    const { data, error } = await db
      .from("team_rides")
      .insert({
        team_id: input.teamId,
        starts_at: input.startsAt,
        meeting_point: input.meetingPoint,
        route: input.route,
        capacity: input.capacity,
        captain_id: user.stravaId,
        created_by: user.stravaId,
      })
      .select(RIDE_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ride: { ...data, checkinCount: 0, canCancel: true } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create ride.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
