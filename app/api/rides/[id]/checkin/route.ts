import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId && !session.athleteId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const identity = session.userId ?? String(session.athleteId);
  const db = supabaseAdmin();
  const { data: champ } = await db.from("users").select("strava_id,role").or(`auth_user_id.eq.${identity},strava_id.eq.${identity}`).eq("role", "champion").maybeSingle();
  if (!champ) return NextResponse.json({ error: "Champion access required." }, { status: 403 });

  const { data: ride } = await db.from("team_rides").select("id,starts_at,capacity").eq("id", id).maybeSingle();
  if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });

  const now = new Date();
  const start = new Date(ride.starts_at);
  if (Math.abs(now.getTime() - start.getTime()) > 12 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Check-in opens on the day of the ride." }, { status: 409 });
  }

  const { count } = await db.from("ride_checkins").select("id", { count: "exact", head: true }).eq("ride_id", id);
  const { data: existing } = await db.from("ride_checkins").select("id").eq("ride_id", id).eq("champ_id", champ.strava_id).maybeSingle();
  if (!existing && (count ?? 0) >= ride.capacity) return NextResponse.json({ error: "This ride is full." }, { status: 409 });
  if (existing) return NextResponse.json({ ok: true, alreadyCheckedIn: true });

  const { error } = await db.from("ride_checkins").insert({ ride_id: id, champ_id: champ.strava_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
