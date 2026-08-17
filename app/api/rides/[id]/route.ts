import { NextResponse } from "next/server";
import { canChampionClub, getSignedInClubUser } from "@/lib/club-auth";
import { CHECKIN_WINDOW_MS } from "@/lib/club-rides";
import { supabaseAdmin } from "@/lib/supabase";

const RIDE_SELECT = "id,starts_at,meeting_point,route,capacity,captain_id,created_by,team_id,team:teams!team_rides_team_id_fkey(id,name,slug),captain:users!team_rides_captain_id_fkey(strava_id,name)";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const db = supabaseAdmin();
    const { data: ride, error } = await db
      .from("team_rides")
      .select(RIDE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (!canChampionClub(user, String(ride.team_id))) {
      return NextResponse.json({ error: "Club champion access required." }, { status: 403 });
    }

    const [{ count, error: countError }, { data: myCheckin, error: myCheckinError }] = await Promise.all([
      db.from("ride_checkins").select("id", { count: "exact", head: true }).eq("ride_id", id),
      db.from("ride_checkins").select("id,checked_in_at").eq("ride_id", id).eq("champ_id", user.stravaId).maybeSingle(),
    ]);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if (myCheckinError) return NextResponse.json({ error: myCheckinError.message }, { status: 500 });

    const startsAt = new Date(ride.starts_at).getTime();
    const now = Date.now();
    const checkinCount = count ?? 0;

    return NextResponse.json({
      ride,
      checkinCount,
      myCheckin: myCheckin ?? null,
      isCaptain: ride.captain_id === user.stravaId,
      canCancel: !user.isAdmin && ride.created_by === user.stravaId && checkinCount === 0,
      checkinOpen: Math.abs(now - startsAt) <= CHECKIN_WINDOW_MS,
      feedbackOpen: now >= startsAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load ride.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (user.isAdmin) {
      return NextResponse.json({ error: "Admins remove rides from the founder console." }, { status: 403 });
    }

    const db = supabaseAdmin();
    const { data: ride, error: rideError } = await db
      .from("team_rides")
      .select("id,team_id,created_by")
      .eq("id", id)
      .maybeSingle();
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (!canChampionClub(user, String(ride.team_id)) || ride.created_by !== user.stravaId) {
      return NextResponse.json({ error: "You can only cancel rides you created for your club." }, { status: 403 });
    }

    const { count, error: countError } = await db
      .from("ride_checkins")
      .select("id", { count: "exact", head: true })
      .eq("ride_id", id);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "This ride already has check-ins and can no longer be cancelled by its creator." }, { status: 409 });
    }

    const { error: deleteError } = await db.from("team_rides").delete().eq("id", id).eq("created_by", user.stravaId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel ride.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
