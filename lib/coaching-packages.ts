export const COACHING_CURRENCY = "ZAR";
export const PERFORMANCE_SINGLE_PRICE_CENTS = 54900;

export type CoachingPackageTier = {
  id: "performance-block-4" | "performance-block-8";
  name: string;
  shortName: string;
  sessions: number;
  durationMinutes: number;
  totalPriceCents: number;
  compareAtCents: number;
  currency: string;
  description: string;
  position: string;
  badge: string;
};

export const COACHING_PACKAGE_TIERS: CoachingPackageTier[] = [
  {
    id: "performance-block-4",
    name: "Performance Block (4 sessions)",
    shortName: "4-session block",
    sessions: 4,
    durationMinutes: 90,
    totalPriceCents: 189900,
    compareAtCents: PERFORMANCE_SINGLE_PRICE_CENTS * 4,
    currency: COACHING_CURRENCY,
    description: "FTP-based structured progression across four coached rides.",
    position: "For riders who want a repeatable training rhythm after the first session.",
    badge: "Save R297",
  },
  {
    id: "performance-block-8",
    name: "Performance Block (8 sessions)",
    shortName: "8-session block",
    sessions: 8,
    durationMinutes: 90,
    totalPriceCents: 349900,
    compareAtCents: PERFORMANCE_SINGLE_PRICE_CENTS * 8,
    currency: COACHING_CURRENCY,
    description: "A full training block tied to an event, FTP target, or return-to-form goal.",
    position: "Best for goal-based prep where the work needs to compound over weeks.",
    badge: "Save R893",
  },
];

export function findCoachingPackageTier(value: unknown) {
  return COACHING_PACKAGE_TIERS.find((tier) => tier.id === value) ?? null;
}

export function coachingPackageSavingsCents(tier: CoachingPackageTier) {
  return Math.max(0, tier.compareAtCents - tier.totalPriceCents);
}

export function coachingPackageDiscountPercent(tier: CoachingPackageTier) {
  if (tier.compareAtCents <= 0) return 0;
  return Math.round((coachingPackageSavingsCents(tier) / tier.compareAtCents) * 1000) / 10;
}

export function coachingPackagePricing(tier: CoachingPackageTier) {
  return {
    lessonCount: tier.sessions,
    unitPriceCents: PERFORMANCE_SINGLE_PRICE_CENTS,
    discountPercent: coachingPackageDiscountPercent(tier),
    grossAmountCents: tier.compareAtCents,
    discountAmountCents: coachingPackageSavingsCents(tier),
    totalAmountCents: tier.totalPriceCents,
    currency: tier.currency,
  };
}
