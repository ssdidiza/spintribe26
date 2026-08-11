import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId && !session.athleteId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const identity = session.userId ?? String(session.athleteId);
  const db = supabaseAdmin();
  const { data: champ } = await db.from("users").select("strava_id,role").or(`auth_user_id.eq.${identity},strava_id.eq.${identity}`).eq("role", "champion").maybeSingle();
  if (!champ) return NextResponse.json({ error: "Champion access required." }, { status: 403 });

  const { data: ride } = await db.from("team_rides").select("id,starts_at").eq("id", id).maybeSingle();
  if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
  if (new Date() < new Date(ride.starts_at)) return NextResponse.json({ error: "Feedback opens after the ride." }, { status: 409 });

  const body = await req.json();
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note || note.length > 2000) return NextResponse.json({ error: "Please enter a note up to 2,000 characters." }, { status: 400 });

  const { error } = await db.from("ride_feedback").upsert({ ride_id: id, champ_id: champ.strava_id, note }, { onConflict: "ride_id,champ_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
