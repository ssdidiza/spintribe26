import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId && !session.athleteId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const identity = session.userId ?? String(session.athleteId);
  const db = supabaseAdmin();
  const { data: champ } = await db.from("users").select("strava_id,name,role").or(`auth_user_id.eq.${identity},strava_id.eq.${identity}`).eq("role", "champion").maybeSingle();
  if (!champ) return NextResponse.json({ error: "Champion access required." }, { status: 403 });

  const { data: ride, error } = await db.from("team_rides").select("id,starts_at,route,capacity,captain_id,captain:users!team_rides_captain_id_fkey(strava_id,name)").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });

  const { count } = await db.from("ride_checkins").select("id", { count: "exact", head: true }).eq("ride_id", id);
  const isCaptain = ride.captain_id === champ.strava_id;
  const { data: myCheckin } = await db.from("ride_checkins").select("id,checked_in_at").eq("ride_id", id).eq("champ_id", champ.strava_id).maybeSingle();
  return NextResponse.json({ ride, checkinCount: count ?? 0, myCheckin: myCheckin ?? null, isCaptain });
}
