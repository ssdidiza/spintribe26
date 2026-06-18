import { NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { mapRaceRow, type RaceRow } from "@/lib/races";
import { supabaseAdmin } from "@/lib/supabase";

const RACE_COLUMNS =
  "id,slug,name,country,province,city,race_date,year_label,distance_km,elevation_m,difficulty,route_type,segments_json,data_verified,is_active";

/** GET /api/races — active race catalogue (admin-maintained, read-only). */
export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("races")
    .select(RACE_COLUMNS)
    .eq("is_active", true)
    .order("race_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ races: (data ?? []).map((row) => mapRaceRow(row as RaceRow)) });
}
