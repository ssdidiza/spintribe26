import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId && !session.athleteId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const identity = session.userId ?? String(session.athleteId);
  const db = supabaseAdmin();
  const { data: champ } = await db.from("users").select("strava_id,name,role").or(`auth_user_id.eq.${identity},strava_id.eq.${identity}`).eq("role", "champion").maybeSingle();
  if (!champ) return NextResponse.json({ error: "Champion access required." }, { status: 403 });

  const { data, error } = await db
    .from("team_rides")
    .update({ captain_id: champ.strava_id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("captain_id", null)
    .select("id,captain_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This ride already has a captain." }, { status: 409 });
  return NextResponse.json({ ok: true, captainId: data.captain_id });
}
