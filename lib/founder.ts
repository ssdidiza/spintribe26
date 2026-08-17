import { Tier, UserRole } from "./types";

const DEFAULT_FOUNDER_STRAVA_ID = "26187606";
const DEFAULT_FOUNDER_AUTH_EMAIL = "ssdidiza@gmail.com";
const DEFAULT_FOUNDER_TIER: Tier = 800;
const DEFAULT_FOUNDER_ZONE = "Cradle";
const VALID_TIERS: Tier[] = [200, 400, 600, 800, 1000];

export function configuredFounderIds() {
  const raw = process.env.FOUNDER_STRAVA_IDS ?? process.env.FOUNDER_STRAVA_ID ?? DEFAULT_FOUNDER_STRAVA_ID;
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

function configuredFounderEmails() {
  const raw = process.env.FOUNDER_AUTH_EMAILS ?? process.env.FOUNDER_AUTH_EMAIL ?? DEFAULT_FOUNDER_AUTH_EMAIL;
  return raw.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function configuredFounderTier(): Tier {
  const tier = Number(process.env.FOUNDER_DEFAULT_TIER);
  return VALID_TIERS.includes(tier as Tier) ? (tier as Tier) : DEFAULT_FOUNDER_TIER;
}

export function isFounderUserId(userId: string | number | null | undefined) {
  if (userId === null || userId === undefined) return false;
  return configuredFounderIds().includes(String(userId));
}

export function isFounderAuthEmail(email: string | null | undefined) {
  if (!email) return false;
  return configuredFounderEmails().includes(email.trim().toLowerCase());
}

export function founderDefaults(): { role: UserRole; tier: Tier; zone: string } {
  return {
    role: "admin",
    tier: configuredFounderTier(),
    zone: process.env.FOUNDER_DEFAULT_ZONE?.trim() || DEFAULT_FOUNDER_ZONE,
  };
}

export function founderRepairTier(currentTier: unknown): Tier {
  const tier = Number(currentTier);
  const fallback = founderDefaults().tier;
  const repaired = VALID_TIERS.includes(tier as Tier) ? Math.max(tier, fallback) : fallback;
  return repaired as Tier;
}
