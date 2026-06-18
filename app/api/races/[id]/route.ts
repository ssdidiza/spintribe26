import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { mapRaceRow, type RaceRow } from "@/lib/races";
import { supabaseAdmin } from "@/lib/supabase";

const RACE_COLUMNS =
  "id,slug,name,country,province,city,race_date,year_label,distance_km,elevation_m,difficulty,route_type,segments_json,data_verified,is_active";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/races/:id — a single active race, looked up by id or slug. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("races")
    .select(RACE_COLUMNS)
    .eq(UUID_RE.test(id) ? "id" : "slug", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Race not found" }, { status: 404 });

  return NextResponse.json({ race: mapRaceRow(data as RaceRow) });
}
