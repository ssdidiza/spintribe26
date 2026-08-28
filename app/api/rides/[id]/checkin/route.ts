import { NextResponse } from "next/server";
import { canChampionClub, getSignedInClubUser } from "@/lib/club-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const db = supabaseAdmin();
    const { data: ride, error: rideError } = await db
      .from("team_rides")
      .select("id,team_id")
      .eq("id", id)
      .maybeSingle();
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (!canChampionClub(user, String(ride.team_id))) {
      return NextResponse.json({ error: "You are not a champion of this club." }, { status: 403 });
    }

    // The RPC locks the ride row while it checks the clock, capacity and
    // uniqueness. That prevents concurrent check-ins from overfilling the
    // final place while this route remains the club-authorization boundary.
    const { data: result, error } = await db.rpc("check_in_team_ride", {
      p_ride_id: id,
      p_champ_id: user.stravaId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (result === "outside_window") {
      return NextResponse.json({ error: "Check-in is available within 12 hours of ride start." }, { status: 409 });
    }
    if (result === "full") return NextResponse.json({ error: "This ride is full." }, { status: 409 });
    if (result === "not_found") return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (result === "already_checked_in") {
      return NextResponse.json({ ok: true, alreadyCheckedIn: true });
    }
    if (result !== "checked_in") {
      return NextResponse.json({ error: "Unable to check in." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, alreadyCheckedIn: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
