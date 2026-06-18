/**
 * Race library types + display metadata.
 *
 * Races are an admin-maintained, read-only catalogue (riders never create races
 * in the MVP). The pacing maths lives in `lib/race-pacing.ts`; this module only
 * holds shared types, the terrain/difficulty constants those calculations key
 * off, and small formatting helpers used by the UI.
 */

export type RaceDifficulty = "easy" | "moderate" | "hard" | "extreme";
export type RaceRouteType = "road" | "mtb" | "gravel" | "mixed";
export type SegmentTerrain = "flat" | "rolling" | "climb" | "descent";
export type TargetMode = "conservative" | "realistic" | "aggressive" | "custom";
export type ReadinessStatus = "ready" | "on_track" | "building" | "early";

export interface RaceSegment {
  name: string;
  distanceKm: number;
  elevationM: number;
  terrain: SegmentTerrain;
}

export interface Race {
  id: string;
  slug: string;
  name: string;
  country: string;
  province: string | null;
  city: string | null;
  /** Exact ISO date when known; otherwise null and `yearLabel` carries the timing. */
  raceDate: string | null;
  yearLabel: string | null;
  distanceKm: number;
  elevationM: number;
  difficulty: RaceDifficulty;
  routeType: RaceRouteType;
  segments: RaceSegment[];
  /** false => route figures are conservative admin-maintained placeholders. */
  dataVerified: boolean;
  isActive: boolean;
}

/**
 * Per-segment speed multipliers relative to a rider's flat-road target speed.
 * Climbs are slow, descents are fast — these encode the elevation cost of a
 * route without needing a power model. Tuned to be conservative and legible.
 */
export const TERRAIN_SPEED_MULTIPLIER: Record<SegmentTerrain, number> = {
  flat: 1.06,
  rolling: 0.95,
  climb: 0.68,
  descent: 1.22,
};

export const TERRAIN_META: Record<SegmentTerrain, { label: string }> = {
  flat: { label: "Flat" },
  rolling: { label: "Rolling" },
  climb: { label: "Climb" },
  descent: { label: "Descent" },
};

export const DIFFICULTY_META: Record<RaceDifficulty, { label: string; accent: string }> = {
  easy: { label: "Easy", accent: "#16a34a" },
  moderate: { label: "Moderate", accent: "#ff7a2f" },
  hard: { label: "Hard", accent: "#ff4b35" },
  extreme: { label: "Extreme", accent: "#da1e67" },
};

export const ROUTE_TYPE_META: Record<RaceRouteType, { label: string }> = {
  road: { label: "Road" },
  mtb: { label: "MTB" },
  gravel: { label: "Gravel" },
  mixed: { label: "Mixed" },
};

export const TARGET_MODES: { id: TargetMode; label: string; blurb: string }[] = [
  { id: "conservative", label: "Conservative", blurb: "Finish strong, ride within yourself." },
  { id: "realistic", label: "Realistic", blurb: "Your honest expected result on current form." },
  { id: "aggressive", label: "Aggressive", blurb: "A stretch target if everything clicks." },
  { id: "custom", label: "Custom finish time", blurb: "Plan backwards from a finish time you set." },
];

export const READINESS_META: Record<
  ReadinessStatus,
  { label: string; accent: string; blurb: string }
> = {
  ready: {
    label: "Race ready",
    accent: "#16a34a",
    blurb: "Your recent riding lines up well with this race.",
  },
  on_track: {
    label: "Nearly there",
    accent: "#ff7a2f",
    blurb: "Solid base — a little more long-ride or climbing work will help.",
  },
  building: {
    label: "Building base",
    accent: "#ff4b35",
    blurb: "You can ride it, but build distance and consistency first.",
  },
  early: {
    label: "Early days",
    accent: "#da1e67",
    blurb: "This race is a big step up from your recent riding. Build gradually.",
  },
};

/** Shape of a `races` row as returned by Supabase (snake_case). */
export interface RaceRow {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  province: string | null;
  city: string | null;
  race_date: string | null;
  year_label: string | null;
  distance_km: number | string | null;
  elevation_m: number | string | null;
  difficulty: string | null;
  route_type: string | null;
  segments_json: unknown;
  data_verified: boolean | null;
  is_active: boolean | null;
}

function coerceSegments(value: unknown): RaceSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const seg = raw as Record<string, unknown>;
      const terrain = String(seg.terrain ?? "rolling") as SegmentTerrain;
      return {
        name: String(seg.name ?? "Segment"),
        distanceKm: Number(seg.distanceKm ?? seg.distance_km ?? 0),
        elevationM: Number(seg.elevationM ?? seg.elevation_m ?? 0),
        terrain: terrain in TERRAIN_SPEED_MULTIPLIER ? terrain : "rolling",
      } satisfies RaceSegment;
    })
    .filter((seg) => seg.distanceKm > 0);
}

export function mapRaceRow(row: RaceRow): Race {
  const difficulty = (row.difficulty ?? "moderate") as RaceDifficulty;
  const routeType = (row.route_type ?? "road") as RaceRouteType;
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    country: row.country ?? "South Africa",
    province: row.province,
    city: row.city,
    raceDate: row.race_date,
    yearLabel: row.year_label,
    distanceKm: Number(row.distance_km ?? 0),
    elevationM: Number(row.elevation_m ?? 0),
    difficulty: difficulty in DIFFICULTY_META ? difficulty : "moderate",
    routeType: routeType in ROUTE_TYPE_META ? routeType : "road",
    segments: coerceSegments(row.segments_json),
    dataVerified: row.data_verified === true,
    isActive: row.is_active !== false,
  };
}

/** "3h 42m" / "48m" from a duration in minutes. */
export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Human label for when a race happens — exact date if known, else year label. */
export function formatRaceWhen(race: Pick<Race, "raceDate" | "yearLabel">): string {
  if (race.raceDate) {
    const date = new Date(race.raceDate);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  return race.yearLabel ?? "Date TBC";
}

export function formatRaceLocation(race: Pick<Race, "city" | "province" | "country">): string {
  return [race.city, race.province, race.country].filter(Boolean).join(", ");
}
