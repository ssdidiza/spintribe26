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
      .select("id,team_id,captain_id")
      .eq("id", id)
      .maybeSingle();
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (!canChampionClub(user, String(ride.team_id))) {
      return NextResponse.json({ error: "You are not a champion of this club." }, { status: 403 });
    }

    // Concurrency invariant: the first UPDATE whose captain_id is still NULL
    // wins. Do not split this into a read-then-write claim.
    const { data, error } = await db
      .from("team_rides")
      .update({ captain_id: user.stravaId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("team_id", ride.team_id)
      .is("captain_id", null)
      .select("id,captain_id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This ride already has a captain." }, { status: 409 });
    return NextResponse.json({ ok: true, captainId: data.captain_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to claim captaincy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
