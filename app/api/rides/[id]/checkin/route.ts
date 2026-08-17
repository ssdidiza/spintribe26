import { NextResponse } from "next/server";
import { canChampionClub, getSignedInClubUser } from "@/lib/club-auth";
import { CHECKIN_WINDOW_MS } from "@/lib/club-rides";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const db = supabaseAdmin();
    const { data: ride, error: rideError } = await db
      .from("team_rides")
      .select("id,team_id,starts_at,capacity")
      .eq("id", id)
      .maybeSingle();
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (!canChampionClub(user, String(ride.team_id))) {
      return NextResponse.json({ error: "You are not a champion of this club." }, { status: 403 });
    }

    const now = Date.now();
    const start = new Date(ride.starts_at).getTime();
    if (Math.abs(now - start) > CHECKIN_WINDOW_MS) {
      return NextResponse.json({ error: "Check-in is available within 12 hours of ride start." }, { status: 409 });
    }

    const [{ count, error: countError }, { data: existing, error: existingError }] = await Promise.all([
      db.from("ride_checkins").select("id", { count: "exact", head: true }).eq("ride_id", id),
      db.from("ride_checkins").select("id").eq("ride_id", id).eq("champ_id", user.stravaId).maybeSingle(),
    ]);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing) return NextResponse.json({ ok: true, alreadyCheckedIn: true });
    if ((count ?? 0) >= ride.capacity) return NextResponse.json({ error: "This ride is full." }, { status: 409 });

    const { error } = await db.from("ride_checkins").insert({ ride_id: id, champ_id: user.stravaId });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ ok: true, alreadyCheckedIn: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
