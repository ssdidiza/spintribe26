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

export async function GET() {
  try {
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const memberships = championMemberships(user);
    if (!user.isAdmin && memberships.length === 0) {
      return NextResponse.json({ error: "Club champion access required." }, { status: 403 });
    }

    const db = supabaseAdmin();
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

    const rideIds = (rides ?? []).map((ride) => String(ride.id));
    const checkinCounts = new Map<string, number>();
    if (rideIds.length) {
      const { data: checkins, error: checkinsError } = await db
        .from("ride_checkins")
        .select("ride_id")
        .in("ride_id", rideIds);
      if (checkinsError) return NextResponse.json({ error: checkinsError.message }, { status: 500 });
      for (const checkin of checkins ?? []) {
        const id = String(checkin.ride_id);
        checkinCounts.set(id, (checkinCounts.get(id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      rides: (rides ?? []).map((ride) => ({
        ...ride,
        checkinCount: checkinCounts.get(String(ride.id)) ?? 0,
        canCancel: !user.isAdmin && ride.created_by === user.stravaId && (checkinCounts.get(String(ride.id)) ?? 0) === 0,
      })),
      memberships,
      isAdmin: user.isAdmin,
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
