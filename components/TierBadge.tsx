import { TIER_LABELS, TIER_COLORS, Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
  tier: Tier;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function TierBadge({ tier, className, size = "md" }: TierBadgeProps) {
  const color = TIER_COLORS[tier];
  const label = TIER_LABELS[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold border",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        size === "lg" && "px-4 py-1.5 text-base",
        className
      )}
      style={{
        color,
        borderColor: `${color}40`,
        background: `${color}15`,
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      {tier} km · {label}
    </span>
  );
}
