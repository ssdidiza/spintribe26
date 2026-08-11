import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

async function currentChamp() {
  const session = await getSession();
  if (!session.userId && !session.athleteId) return null;
  const id = session.userId ?? String(session.athleteId);
  const db = supabaseAdmin();
  const { data } = await db.from("users").select("strava_id, name, role").or(`auth_user_id.eq.${id},strava_id.eq.${id}`).eq("role", "champion").maybeSingle();
  return data;
}

export async function GET() {
  const champ = await currentChamp();
  if (!champ) return NextResponse.json({ error: "Champion access required." }, { status: 403 });
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("team_rides")
    .select("id, starts_at, route, capacity, captain_id, captain:users!team_rides_captain_id_fkey(strava_id,name)")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(4);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rides: data ?? [] });
}
