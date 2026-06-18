import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { mapRaceRow, type RaceRow } from "@/lib/races";
import type { RacePlanResult } from "@/lib/race-pacing";
import { supabaseAdmin } from "@/lib/supabase";

const RACE_COLUMNS =
  "id,slug,name,country,province,city,race_date,year_label,distance_km,elevation_m,difficulty,route_type,segments_json,data_verified,is_active";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/race-plans/:id — a single PRIVATE plan. The `user_strava_id` filter
 * means another rider's plan is never returned (it 404s, not 403, so we don't
 * even confirm a plan exists for someone else).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  // Plan ids are uuids; a malformed id can't match a real plan and would
  // otherwise trigger a Postgres 22P02 (→ 500). Treat it as not found, which
  // also keeps the privacy-preserving "404, never confirm existence" behaviour.
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Race plan not found" }, { status: 404 });

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("race_plans")
    .select(`id,race_id,target_mode,custom_finish_minutes,plan_json,readiness_status,readiness_score,created_at,updated_at,races!race_plans_race_id_fkey(${RACE_COLUMNS})`)
    .eq("id", id)
    .eq("user_strava_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Race plan not found" }, { status: 404 });

  const raceRow = Array.isArray(data.races) ? data.races[0] : data.races;

  return NextResponse.json({
    id: String(data.id),
    mode: data.target_mode,
    customFinishMinutes: data.custom_finish_minutes,
    updatedAt: data.updated_at,
    race: raceRow ? mapRaceRow(raceRow as unknown as RaceRow) : null,
    plan: data.plan_json as RacePlanResult,
  });
}
