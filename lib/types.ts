export type UserRole = "champion" | "member" | "admin";

export type Tier = 200 | 400 | 600 | 800 | 1000;

export type SessionType = "ftp_improver" | "champing";

export type ZoneType = "geographic" | "training";

export interface User {
  id: string;
  stravaId: string;
  name: string;
  avatar: string;
  role: UserRole;
  tier: Tier;
  isConnected: boolean;
  region?: string;
  zone?: string;
  onboarded?: boolean;
  leaderboardConsent?: boolean;
  rewardsExportConsent?: boolean;
  ftp?: number;        // Functional Threshold Power (watts) from Strava
  ftpCachedAt?: string;
  country?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'welcome' | 'info' | 'achievement';
  title: string;
  body: string;
  dismissedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export type TierUpgradeStatus = "pending" | "approved" | "rejected";

export interface TierUpgradeRequest {
  id: string;
  userId: string;
  currentTier: Tier;
  requestedTier: Tier;
  monthKey: string;
  monthlyKm: number;
  status: TierUpgradeStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  effectiveOn: string;
  appliedAt?: string;
  adminNote?: string;
}

export interface Activity {
  id: string;
  userId: string;
  stravaId: string;
  name: string;
  distance: number; // metres
  movingTime: number; // seconds
  type: string;
  date: string; // ISO
  kudos: number;
  detectedZoneId?: string; // matched zone id from GPS
}

export interface Zone {
  id: string;
  name: string;
  region: string;
  type: ZoneType;
  description: string;
  createdBy: string; // user id
  createdByName: string;
  usageCount: number;
  createdAt: string; // ISO
}

export interface ChampionSession {
  id: string;
  userId: string;
  type: SessionType;
  date: string; // ISO date of the linked Strava activity, not the day it was logged.
  notes: string;
  // Zone linking
  zoneId?: string;
  zoneName?: string;
  // Strava activity proof
  stravaActivityId?: string;
  stravaActivityName?: string;
  stravaActivityKm?: number;
}

export interface LeaderboardEntry {
  user: User;
  totalKm: number;
  targetKm: Tier;
  progressPct: number;
  rank: number;
  sessions?: number;
}

// ─── Role utility functions ───────────────────────────────────────────────────

/** True only for superuser admins */
export function hasAdminRole(user: User | null | undefined): boolean {
  return user?.role === "admin";
}

/** True for champions AND admins (admins can access all champion features) */
export function canAccessChampionFeatures(user: User | null | undefined): boolean {
  return user?.role === "champion" || user?.role === "admin";
}

/** True for any authenticated, onboarded user */
export function isAuthenticated(user: User | null | undefined): boolean {
  return !!user;
}

// ─── Tier metadata ────────────────────────────────────────────────────────────

export const TIER_LABELS: Record<Tier, string> = {
  200: "Beginner",
  400: "Intermediate",
  600: "Intermediate 2",
  800: "Advanced",
  1000: "Unicorn",
};

export const TIER_COLORS: Record<Tier, string> = {
  200: "#b8b8b8",
  400: "#ffffff",
  600: "#ffb1c1",
  800: "#ff7a2f",
  1000: "#ff4b35",
};

export const TIER_GRADIENT: Record<Tier, string> = {
  200: "from-zinc-400 to-zinc-600",
  400: "from-white to-zinc-300",
  600: "from-rose-200 to-orange-400",
  800: "from-orange-400 to-red-500",
  1000: "from-red-500 to-pink-700",
};

// ─── Geographic zone bounding boxes (lat/lng) ────────────────────────────────
// Used to auto-detect which zone an activity took place in from GPS coords.
export interface ZoneBounds {
  id: string;
  latMin: number; latMax: number;
  lngMin: number; lngMax: number;
}

export const ZONE_BOUNDS: ZoneBounds[] = [
  // Gauteng
  { id: "gz-centurion",    latMin: -25.95, latMax: -25.78, lngMin: 28.05, lngMax: 28.25 },
  { id: "gz-cradle",       latMin: -26.08, latMax: -25.88, lngMin: 27.65, lngMax: 27.95 },
  { id: "gz-east-rand",    latMin: -26.35, latMax: -26.05, lngMin: 28.18, lngMax: 28.68 },
  { id: "gz-joburg-south", latMin: -26.52, latMax: -26.18, lngMin: 27.78, lngMax: 28.22 },
  // Western Cape
  { id: "wc-coastal",      latMin: -34.10, latMax: -33.85, lngMin: 18.25, lngMax: 18.50 },
  { id: "wc-northern",     latMin: -33.95, latMax: -33.62, lngMin: 18.50, lngMax: 18.82 },
  { id: "wc-paarl",        latMin: -33.82, latMax: -33.60, lngMin: 18.88, lngMax: 19.12 },
  { id: "wc-southern",     latMin: -34.12, latMax: -33.88, lngMin: 18.38, lngMax: 18.62 },
  // KwaZulu-Natal
  { id: "kzn-durban",      latMin: -30.10, latMax: -29.70, lngMin: 30.78, lngMax: 31.12 },
];

/** Returns the zone id for a GPS coordinate, or null if outside all zones */
export function detectZoneFromGPS(lat?: number, lng?: number): string | null {
  if (!lat || !lng) return null;
  for (const z of ZONE_BOUNDS) {
    if (lat >= z.latMin && lat <= z.latMax && lng >= z.lngMin && lng <= z.lngMax) {
      return z.id;
    }
  }
  return null;
}

// Default zones seeded — one per geographic area defined above
export const SEED_ZONES: Zone[] = [
  // Gauteng
  {
    id: "gz-centurion",
    name: "Centurion",
    region: "Gauteng",
    type: "geographic",
    description: "Tshwane South routes — Centurion, Irene, and surrounding flats",
    createdBy: "system", createdByName: "spera",
    usageCount: 18, createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "gz-cradle",
    name: "Cradle",
    region: "Gauteng",
    type: "geographic",
    description: "Muldersdrift climbs toward the Cradle of Humankind — tough and scenic",
    createdBy: "system", createdByName: "spera",
    usageCount: 14, createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "gz-east-rand",
    name: "East Rand",
    region: "Gauteng",
    type: "geographic",
    description: "Ekurhuleni roads — Boksburg, Benoni, Germiston and surrounds",
    createdBy: "system", createdByName: "spera",
    usageCount: 9, createdAt: "2026-01-15T06:00:00Z",
  },
  {
    id: "gz-joburg-south",
    name: "Joburg South",
    region: "Gauteng",
    type: "geographic",
    description: "Alberton, Ennerdale and southern JHB corridors",
    createdBy: "system", createdByName: "spera",
    usageCount: 11, createdAt: "2026-01-15T06:00:00Z",
  },
  // Western Cape
  {
    id: "wc-coastal",
    name: "Coastal Suburbs",
    region: "Western Cape",
    type: "geographic",
    description: "Sea Point, Camps Bay, Green Point, Hout Bay — ocean-side routes",
    createdBy: "system", createdByName: "spera",
    usageCount: 21, createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "wc-northern",
    name: "Northern Suburbs",
    region: "Western Cape",
    type: "geographic",
    description: "Bellville, Durbanville, Brackenfell — flat to rolling terrain",
    createdBy: "system", createdByName: "spera",
    usageCount: 16, createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "wc-paarl",
    name: "Paarl",
    region: "Western Cape",
    type: "geographic",
    description: "Paarl valley and surrounding wine-country climbs",
    createdBy: "system", createdByName: "spera",
    usageCount: 8, createdAt: "2026-02-01T06:00:00Z",
  },
  {
    id: "wc-southern",
    name: "Southern Suburbs",
    region: "Western Cape",
    type: "geographic",
    description: "Constantia, Rondebosch, Claremont — mountain-side routes",
    createdBy: "system", createdByName: "spera",
    usageCount: 12, createdAt: "2026-01-01T06:00:00Z",
  },
  // KwaZulu-Natal
  {
    id: "kzn-durban",
    name: "Durban",
    region: "KwaZulu-Natal",
    type: "geographic",
    description: "Durban coastal and inland routes — humidity-tested legs",
    createdBy: "system", createdByName: "spera",
    usageCount: 7, createdAt: "2026-02-01T06:00:00Z",
  },
  // National training zone
  {
    id: "nat-ftp",
    name: "FTP Block Sessions",
    region: "National",
    type: "training",
    description: "Indoor structured 4×8min FTP intervals — virtual everywhere",
    createdBy: "system", createdByName: "spera",
    usageCount: 31, createdAt: "2026-01-01T06:00:00Z",
  },
];

