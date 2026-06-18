import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { mapRaceRow, type RaceRow, type TargetMode } from "@/lib/races";
import { buildRacePlan, computeRiderForm, type RiderActivityRow } from "@/lib/race-pacing";
import { supabaseAdmin } from "@/lib/supabase";

const RACE_COLUMNS =
  "id,slug,name,country,province,city,race_date,year_label,distance_km,elevation_m,difficulty,route_type,segments_json,data_verified,is_active";

const VALID_MODES: TargetMode[] = ["conservative", "realistic", "aggressive", "custom"];

// How far back to pull the rider's own rides to derive current form. Covers the
// 90-day form window and the 28-day consistency window with headroom.
const FORM_FETCH_DAYS = 120;

type PlanJson = { selected?: { finishMinutes?: number; requiredAvgSpeedKmh?: number } };

/** GET /api/race-plans — the signed-in rider's OWN plans (never anyone else's). */
export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("race_plans")
    // Single FK race_plans -> races, but the hint keeps us safe from ambiguous
    // embeds (the June 2026 "one rider in the 200 Club" class of bug).
    .select(`id,race_id,target_mode,custom_finish_minutes,plan_json,readiness_status,readiness_score,updated_at,races!race_plans_race_id_fkey(${RACE_COLUMNS})`)
    .eq("user_strava_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const plans = (data ?? []).map((row) => {
    const raceRow = Array.isArray(row.races) ? row.races[0] : row.races;
    const plan = (row.plan_json ?? {}) as PlanJson;
    return {
      id: String(row.id),
      raceId: String(row.race_id),
      mode: row.target_mode as TargetMode,
      readinessStatus: row.readiness_status,
      readinessScore: row.readiness_score,
      finishMinutes: plan.selected?.finishMinutes ?? null,
      requiredAvgSpeedKmh: plan.selected?.requiredAvgSpeedKmh ?? null,
      updatedAt: row.updated_at,
      race: raceRow ? mapRaceRow(raceRow as unknown as RaceRow) : null,
    };
  });

  return NextResponse.json({ plans });
}

/**
 * POST /api/race-plans — generate (or regenerate) a PRIVATE pace plan for a race
 * using only the signed-in rider's own activity data. One plan per race per
 * rider; regenerating updates the existing row.
 *
 * Body: { raceId: string, targetMode: TargetMode, customFinishMinutes?: number }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { raceId?: string; targetMode?: string; customFinishMinutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // req.json() also resolves for valid JSON primitives (e.g. `null`), which would
  // otherwise throw a TypeError on the property reads below (→ 500).
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raceId = String(body.raceId ?? "").trim();
  const targetMode = String(body.targetMode ?? "") as TargetMode;
  if (!raceId) return NextResponse.json({ error: "raceId is required" }, { status: 400 });
  if (!VALID_MODES.includes(targetMode)) {
    return NextResponse.json({ error: "Invalid targetMode" }, { status: 400 });
  }

  let customFinishMinutes: number | null = null;
  if (targetMode === "custom") {
    const minutes = Number(body.customFinishMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return NextResponse.json(
        { error: "customFinishMinutes (a positive number) is required for custom mode" },
        { status: 400 }
      );
    }
    // Guard against absurd values (cap at 24h).
    customFinishMinutes = Math.min(Math.round(minutes), 24 * 60);
  }

  const db = supabaseAdmin();

  const { data: raceRow, error: raceError } = await db
    .from("races")
    .select(RACE_COLUMNS)
    .eq("id", raceId)
    .eq("is_active", true)
    .maybeSingle();

  if (raceError) return NextResponse.json({ error: raceError.message }, { status: 500 });
  if (!raceRow) return NextResponse.json({ error: "Race not found" }, { status: 404 });
  const race = mapRaceRow(raceRow as RaceRow);

  const now = new Date();
  const formCutoff = new Date(now.getTime() - FORM_FETCH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: userRow, error: userError }, { data: activities, error: activitiesError }] =
    await Promise.all([
      db
        .from("users")
        .select("strava_id,tier,current_league_threshold")
        .eq("strava_id", userId)
        .maybeSingle(),
      db
        .from("activities")
        .select("distance,elevation_gain,moving_time,type,date")
        .eq("user_strava_id", userId)
        .gte("date", formCutoff),
    ]);

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  const leagueThreshold = Number(userRow?.current_league_threshold ?? userRow?.tier ?? 400);
  const form = computeRiderForm((activities ?? []) as RiderActivityRow[], leagueThreshold, now);
  const plan = buildRacePlan(race, form, targetMode, customFinishMinutes, now);

  const { data: saved, error: saveError } = await db
    .from("race_plans")
    .upsert(
      {
        user_strava_id: userId,
        race_id: race.id,
        target_mode: targetMode,
        custom_finish_minutes: customFinishMinutes,
        plan_json: plan,
        readiness_status: plan.readiness.status,
        readiness_score: plan.readiness.score,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_strava_id,race_id" }
    )
    .select("id")
    .maybeSingle();

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  return NextResponse.json({ id: saved?.id ? String(saved.id) : null, race, plan }, { status: 201 });
}
