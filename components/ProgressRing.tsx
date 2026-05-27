"use client";

interface ProgressRingProps {
  pct: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  gradient?: boolean;
}

export default function ProgressRing({
  pct,
  size = 160,
  strokeWidth = 12,
  color = "#ff4b35",
  label,
  sublabel,
  gradient = true,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;
  const gradId = `ring-grad-${size}`;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          {gradient && (
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff7a2f" />
              <stop offset="50%" stopColor="#ff3b30" />
              <stop offset="100%" stopColor="#e0007a" />
            </linearGradient>
          )}
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={gradient ? `url(#${gradId})` : color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.8s ease",
            filter: "drop-shadow(0 0 6px rgba(255,75,53,0.48))",
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        {label && (
          <span className="text-2xl font-bold text-white">{label}</span>
        )}
        {sublabel && (
          <span className="text-xs text-[#b8b8b8] mt-0.5">{sublabel}</span>
        )}
        <span
          className="text-sm font-semibold mt-1"
          style={{ color: gradient ? "#ff4b35" : color }}
        >
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}
