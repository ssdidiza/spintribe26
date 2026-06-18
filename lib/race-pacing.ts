/**
 * Race pace planning — pure, explainable maths. No AI, no external calls.
 *
 * Everything here runs server-side from the SIGNED-IN RIDER'S OWN Strava-derived
 * activities (see `app/api/race-plans/route.ts`). A plan is never built from, or
 * compared against, another rider's data.
 *
 * The model is deliberately simple so every number on screen can be explained:
 *
 *   1. Base speed   — the rider's recent average riding speed (distance / moving
 *                     time across cycling rides in the last 90 days).
 *   2. Effort mode  — conservative / realistic / aggressive scale the base speed;
 *                     a custom mode instead works backwards from a finish time.
 *   3. Terrain      — each route segment carries a terrain speed multiplier
 *                     (climbs slow you, descents speed you up). With no segments
 *                     we fall back to a flat-equivalent distance from elevation.
 *   4. Readiness    — a 0–100 score blending long-ride distance, monthly volume,
 *                     climbing and consistency against the race's demands.
 */

import {
  TERRAIN_SPEED_MULTIPLIER,
  type Race,
  type ReadinessStatus,
  type TargetMode,
} from "./races";

const CYCLING_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "Velomobile"]);

// Lookback windows.
const FORM_LOOKBACK_DAYS = 90; // base speed, longest ride, ride count
const CONSISTENCY_LOOKBACK_DAYS = 28; // active days

// Effort multipliers applied to base speed for the three reference targets.
const MODE_EFFORT: Record<Exclude<TargetMode, "custom">, number> = {
  conservative: 0.93,
  realistic: 1.0,
  aggressive: 1.07,
};

// Flat-equivalent cost of climbing, used only when a race has no segments:
// every 100 m of ascent adds ~0.9 km of flat-equivalent effort.
const CLIMB_EQUIV_KM_PER_100M = 0.9;

// Plausible road cycling speeds (km/h) — clamps base speed + custom solutions.
const MIN_SPEED_KMH = 12;
const MAX_SPEED_KMH = 45;

// Fallback base speed by league threshold when the rider has no usable pace data.
const LEAGUE_DEFAULT_SPEED: Record<number, number> = {
  200: 21,
  400: 23,
  600: 25,
  800: 27,
  1000: 29,
};

export interface RiderActivityRow {
  distance: number | string | null; // metres
  elevation_gain?: number | string | null; // metres
  moving_time?: number | string | null; // seconds
  type: string | null;
  date: string | null;
}

export interface RiderForm {
  baseSpeedKmh: number;
  /** true when base speed came from a league default, not real ride data. */
  baseSpeedEstimated: boolean;
  monthlyKm: number;
  longestRideKm: number;
  longestRideElevationM: number;
  avgRideElevationM: number;
  recentRideCount: number;
  activeDays: number;
  leagueThreshold: number;
}

export interface PlannedSegment {
  name: string;
  distanceKm: number;
  elevationM: number;
  terrain: string;
  speedKmh: number;
  timeMinutes: number;
  cumulativeMinutes: number;
}

export interface TargetSummary {
  mode: Exclude<TargetMode, "custom"> | "custom";
  requiredAvgSpeedKmh: number;
  finishMinutes: number;
  flatTargetSpeedKmh: number;
}

export interface ReadinessFactor {
  key: "distance" | "volume" | "climbing" | "consistency";
  label: string;
  scorePct: number; // 0–100 contribution before weighting
  detail: string;
}

export interface PlanWarning {
  severity: "info" | "warn" | "high";
  message: string;
}

export interface RacePlanResult {
  raceId: string;
  raceName: string;
  generatedAt: string;
  mode: TargetMode;
  customFinishMinutes: number | null;
  riderForm: RiderForm;
  selected: TargetSummary & { segments: PlannedSegment[] };
  targets: {
    conservative: TargetSummary;
    realistic: TargetSummary;
    aggressive: TargetSummary;
  };
  readiness: {
    status: ReadinessStatus;
    score: number;
    factors: ReadinessFactor[];
  };
  warnings: PlanWarning[];
}

function clampSpeed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_SPEED_KMH;
  return Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function leagueDefaultSpeed(leagueThreshold: number): number {
  return LEAGUE_DEFAULT_SPEED[leagueThreshold] ?? 23;
}

/**
 * Derive a rider's current form from their own activities. `leagueThreshold`
 * is the rider's competitive league (200/400/.../1000) used for the fallback
 * base speed when there is no usable pace data.
 */
export function computeRiderForm(
  activities: RiderActivityRow[],
  leagueThreshold: number,
  now: Date = new Date()
): RiderForm {
  const formCutoff = now.getTime() - FORM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const consistencyCutoff = now.getTime() - CONSISTENCY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let paceDistanceM = 0;
  let paceTimeS = 0;
  let monthlyMetres = 0;
  let longestRideMetres = 0;
  let longestRideElevationM = 0;
  let elevationSum = 0;
  let recentRideCount = 0;
  const activeDays = new Set<string>();

  for (const activity of activities) {
    if (!CYCLING_TYPES.has(activity.type ?? "")) continue;
    if (!activity.date) continue;
    const time = new Date(activity.date).getTime();
    if (Number.isNaN(time)) continue;

    const metres = Number(activity.distance ?? 0);
    const elevation = Number(activity.elevation_gain ?? 0);
    const movingTime = Number(activity.moving_time ?? 0);

    if (time >= monthStart) monthlyMetres += metres;

    if (time >= formCutoff) {
      recentRideCount += 1;
      elevationSum += elevation;
      if (metres > longestRideMetres) {
        longestRideMetres = metres;
        longestRideElevationM = elevation;
      }
      if (movingTime > 0 && metres > 0) {
        paceDistanceM += metres;
        paceTimeS += movingTime;
      }
    }

    if (time >= consistencyCutoff) {
      activeDays.add(dateKey(activity.date));
    }
  }

  const hasPaceData = paceTimeS > 0 && paceDistanceM > 0;
  const baseSpeedKmh = hasPaceData
    ? clampSpeed((paceDistanceM / paceTimeS) * 3.6)
    : leagueDefaultSpeed(leagueThreshold);

  return {
    baseSpeedKmh: round1(baseSpeedKmh),
    baseSpeedEstimated: !hasPaceData,
    monthlyKm: Math.round(monthlyMetres / 1000),
    longestRideKm: Math.round(longestRideMetres / 1000),
    longestRideElevationM: Math.round(longestRideElevationM),
    avgRideElevationM: recentRideCount > 0 ? Math.round(elevationSum / recentRideCount) : 0,
    recentRideCount,
    activeDays: activeDays.size,
    leagueThreshold,
  };
}

/**
 * Finish time (hours) for a given flat-road target speed. Uses route segments
 * when present (terrain multipliers are the source of truth); otherwise falls
 * back to a flat-equivalent distance derived from total elevation.
 */
function estimateFinishHours(race: Race, flatSpeedKmh: number): number {
  if (race.segments.length > 0) {
    return race.segments.reduce((sum, seg) => {
      const mult = TERRAIN_SPEED_MULTIPLIER[seg.terrain] ?? 0.95;
      return sum + seg.distanceKm / (flatSpeedKmh * mult);
    }, 0);
  }
  const effectiveDistance = race.distanceKm + (race.elevationM / 100) * CLIMB_EQUIV_KM_PER_100M;
  return effectiveDistance / flatSpeedKmh;
}

/**
 * The finish-time model is inversely proportional to flat speed, so the whole
 * route reduces to a single constant K (= finish hours at 1 km/h). This lets us
 * invert it for the custom-finish-time mode without any solver.
 */
function routeConstant(race: Race): number {
  return estimateFinishHours(race, 1);
}

function paceSegments(race: Race, flatSpeedKmh: number): PlannedSegment[] {
  let cumulative = 0;
  return race.segments.map((seg) => {
    const mult = TERRAIN_SPEED_MULTIPLIER[seg.terrain] ?? 0.95;
    const speed = flatSpeedKmh * mult;
    const minutes = (seg.distanceKm / speed) * 60;
    cumulative += minutes;
    return {
      name: seg.name,
      distanceKm: seg.distanceKm,
      elevationM: seg.elevationM,
      terrain: seg.terrain,
      speedKmh: round1(speed),
      timeMinutes: Math.round(minutes),
      cumulativeMinutes: Math.round(cumulative),
    };
  });
}

function summarizeTarget(
  race: Race,
  flatSpeedKmh: number,
  mode: TargetSummary["mode"]
): TargetSummary {
  const finishHours = estimateFinishHours(race, flatSpeedKmh);
  return {
    mode,
    flatTargetSpeedKmh: round1(flatSpeedKmh),
    finishMinutes: Math.round(finishHours * 60),
    requiredAvgSpeedKmh: round1(race.distanceKm / finishHours),
  };
}

function buildReadiness(race: Race, form: RiderForm): RacePlanResult["readiness"] {
  // Each ratio is "how ready are you" on that axis, capped at 1 (100%).
  const distanceRatio = Math.min(1, form.longestRideKm / Math.max(1, race.distanceKm));
  const volumeRatio = Math.min(1, form.monthlyKm / Math.max(1, race.distanceKm * 2));
  // Climbing: compare the rider's biggest recent climbing effort to the race.
  // If the race is essentially flat, climbing readiness is a non-issue (full marks).
  const climbingRatio =
    race.elevationM <= 200
      ? 1
      : Math.min(1, form.longestRideElevationM / Math.max(1, race.elevationM));
  // Consistency blends active days (last 4 weeks) and recent ride count (90d).
  const activeDaysRatio = Math.min(1, form.activeDays / 12);
  const rideCountRatio = Math.min(1, form.recentRideCount / 18);
  const consistencyRatio = activeDaysRatio * 0.6 + rideCountRatio * 0.4;

  const weights = { distance: 0.35, volume: 0.2, climbing: 0.2, consistency: 0.25 };
  const score = Math.round(
    100 *
      (distanceRatio * weights.distance +
        volumeRatio * weights.volume +
        climbingRatio * weights.climbing +
        consistencyRatio * weights.consistency)
  );

  const status: ReadinessStatus =
    score >= 80 ? "ready" : score >= 60 ? "on_track" : score >= 40 ? "building" : "early";

  const factors: ReadinessFactor[] = [
    {
      key: "distance",
      label: "Long-ride distance",
      scorePct: Math.round(distanceRatio * 100),
      detail: `Longest recent ride ${form.longestRideKm} km vs ${Math.round(race.distanceKm)} km race`,
    },
    {
      key: "volume",
      label: "Monthly volume",
      scorePct: Math.round(volumeRatio * 100),
      detail: `${form.monthlyKm} km so far this month`,
    },
    {
      key: "climbing",
      label: "Climbing",
      scorePct: Math.round(climbingRatio * 100),
      detail:
        race.elevationM <= 200
          ? "Mostly flat route — climbing is not a limiter"
          : `Biggest recent climb ${form.longestRideElevationM} m vs ${Math.round(race.elevationM)} m race`,
    },
    {
      key: "consistency",
      label: "Consistency",
      scorePct: Math.round(consistencyRatio * 100),
      detail: `${form.activeDays} active days in 4 weeks · ${form.recentRideCount} rides in 90 days`,
    },
  ];

  return { status, score, factors };
}

function buildWarnings(
  race: Race,
  form: RiderForm,
  mode: TargetMode,
  selected: TargetSummary,
  readinessScore: number
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (form.baseSpeedEstimated) {
    warnings.push({
      severity: "info",
      message:
        "We don't have recent rides with pace data, so this plan uses a league-based speed estimate. Sync Strava for a sharper plan.",
    });
  }

  if (form.longestRideKm > 0 && form.longestRideKm < race.distanceKm * 0.6) {
    warnings.push({
      severity: "warn",
      message: `Your longest recent ride (${form.longestRideKm} km) is well under the ${Math.round(
        race.distanceKm
      )} km race distance — add at least one longer ride before race day.`,
    });
  }

  if (
    race.elevationM > 600 &&
    form.longestRideElevationM > 0 &&
    form.longestRideElevationM < race.elevationM * 0.5
  ) {
    warnings.push({
      severity: "warn",
      message: `This route climbs ~${Math.round(
        race.elevationM
      )} m. Your recent rides top out around ${form.longestRideElevationM} m of climbing — seek out some hills first.`,
    });
  }

  if (form.activeDays < 6) {
    warnings.push({
      severity: "warn",
      message: `You've ridden ${form.activeDays} day${
        form.activeDays === 1 ? "" : "s"
      } in the last 4 weeks. More regular riding will make this target far more achievable.`,
    });
  }

  if (mode === "aggressive" && readinessScore < 60) {
    warnings.push({
      severity: "warn",
      message:
        "Your aggressive target is ambitious given your recent form — the realistic target is a safer goal.",
    });
  }

  if (mode === "custom") {
    if (selected.flatTargetSpeedKmh > form.baseSpeedKmh * 1.25) {
      warnings.push({
        severity: "high",
        message: `This finish time needs an effort well above your recent average (about ${selected.flatTargetSpeedKmh} km/h on the flat vs your ${form.baseSpeedKmh} km/h) — it may not be realistic.`,
      });
    } else if (selected.flatTargetSpeedKmh < form.baseSpeedKmh * 0.6) {
      warnings.push({
        severity: "info",
        message: "This is a very relaxed target — on current form you could likely finish faster.",
      });
    }
  }

  return warnings;
}

/**
 * Build a full, private race pace plan. `customFinishMinutes` is only used (and
 * required) when `mode === "custom"`.
 */
export function buildRacePlan(
  race: Race,
  form: RiderForm,
  mode: TargetMode,
  customFinishMinutes: number | null = null,
  now: Date = new Date()
): RacePlanResult {
  const targets = {
    conservative: summarizeTarget(race, form.baseSpeedKmh * MODE_EFFORT.conservative, "conservative"),
    realistic: summarizeTarget(race, form.baseSpeedKmh * MODE_EFFORT.realistic, "realistic"),
    aggressive: summarizeTarget(race, form.baseSpeedKmh * MODE_EFFORT.aggressive, "aggressive"),
  };

  let selectedFlatSpeed: number;
  let selectedMode: TargetSummary["mode"];
  if (mode === "custom" && customFinishMinutes && customFinishMinutes > 0) {
    // Invert the route constant: finish = K / flatSpeed  =>  flatSpeed = K / finish.
    const K = routeConstant(race);
    const targetHours = customFinishMinutes / 60;
    selectedFlatSpeed = clampSpeed(K / targetHours);
    selectedMode = "custom";
  } else {
    const resolvedMode: Exclude<TargetMode, "custom"> =
      mode === "custom" ? "realistic" : mode;
    selectedFlatSpeed = form.baseSpeedKmh * MODE_EFFORT[resolvedMode];
    selectedMode = resolvedMode;
  }

  const selectedSummary = summarizeTarget(race, selectedFlatSpeed, selectedMode);
  const segments = paceSegments(race, selectedFlatSpeed);
  const readiness = buildReadiness(race, form);
  const warnings = buildWarnings(race, form, mode, selectedSummary, readiness.score);

  return {
    raceId: race.id,
    raceName: race.name,
    generatedAt: now.toISOString(),
    mode,
    customFinishMinutes: mode === "custom" ? customFinishMinutes ?? null : null,
    riderForm: form,
    selected: { ...selectedSummary, segments },
    targets,
    readiness,
    warnings,
  };
}
