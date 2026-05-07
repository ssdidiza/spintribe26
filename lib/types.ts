export type UserRole = "champion" | "member" | "admin";

export type Tier = 200 | 400 | 800 | 1000;

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
  date: string;
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
  200: "Rookie",
  400: "Contender",
  800: "Elite",
  1000: "Pinnacle",
};

export const TIER_COLORS: Record<Tier, string> = {
  200: "#60a5fa",
  400: "#34d399",
  800: "#f97316",
  1000: "#a78bfa",
};

export const TIER_GRADIENT: Record<Tier, string> = {
  200: "from-blue-500 to-blue-700",
  400: "from-emerald-500 to-emerald-700",
  800: "from-orange-500 to-orange-700",
  1000: "from-violet-500 to-violet-700",
};

// Default zones seeded for each region
export const SEED_ZONES: Zone[] = [
  {
    id: "z1",
    name: "Cradle Descent",
    region: "Gauteng",
    type: "geographic",
    description: "Weekly climb from Muldersdrift toward the Cradle of Humankind",
    createdBy: "system",
    createdByName: "SpinTribe",
    usageCount: 14,
    createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "z2",
    name: "Suikerbosrand Loop",
    region: "Gauteng",
    type: "geographic",
    description: "60km weekend loop through the nature reserve",
    createdBy: "system",
    createdByName: "SpinTribe",
    usageCount: 9,
    createdAt: "2026-01-15T06:00:00Z",
  },
  {
    id: "z3",
    name: "Chapman's Peak Classic",
    region: "Western Cape",
    type: "geographic",
    description: "Coastal route — Hout Bay to Noordhoek and back",
    createdBy: "system",
    createdByName: "SpinTribe",
    usageCount: 21,
    createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "z4",
    name: "FTP Block Sessions",
    region: "National",
    type: "training",
    description: "Indoor structured 4×8min FTP intervals",
    createdBy: "system",
    createdByName: "SpinTribe",
    usageCount: 31,
    createdAt: "2026-01-01T06:00:00Z",
  },
  {
    id: "z5",
    name: "Valley of Ales Climb",
    region: "KwaZulu-Natal",
    type: "geographic",
    description: "Epic hillside route above the Valley of a Thousand Hills",
    createdBy: "system",
    createdByName: "SpinTribe",
    usageCount: 7,
    createdAt: "2026-02-01T06:00:00Z",
  },
];
