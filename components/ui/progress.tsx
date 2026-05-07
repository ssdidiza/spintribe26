"use client";

import { cn } from "@/lib/utils";

interface ProgressProps {
  value?: number;
  className?: string;
  indicatorColor?: string;
  style?: React.CSSProperties;
}

function Progress({ value = 0, className, indicatorColor, style }: ProgressProps) {
  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      style={style}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: indicatorColor ?? "hsl(var(--primary))",
        }}
      />
    </div>
  );
}

export { Progress };
