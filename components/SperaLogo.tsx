import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
};

export function SperaIcon({ className, title = "spera" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 220 220"
      role="img"
      aria-label={title}
      className={cn("block", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="spera-icon-gradient" x1="25" y1="58" x2="184" y2="174" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff7a2f" />
          <stop offset="0.5" stopColor="#ff2d55" />
          <stop offset="1" stopColor="#e0007a" />
        </linearGradient>
        <filter id="spera-icon-soft-shadow" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#ff2d55" floodOpacity="0.2" />
        </filter>
      </defs>
      <path
        d="M164 63H92C57.2 63 29 91.2 29 126s28.2 63 63 63h31"
        stroke="url(#spera-icon-gradient)"
        strokeWidth="45"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#spera-icon-soft-shadow)"
      />
      <path
        d="M56 157h72c34.8 0 63-28.2 63-63s-28.2-63-63-63H97"
        stroke="url(#spera-icon-gradient)"
        strokeWidth="45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56 157h71.5c18 0 31.5-13.4 31.5-31.5"
        stroke="var(--background)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M164 63H92.5C74.5 63 61 76.4 61 94.5"
        stroke="var(--background)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type BrandMarkProps = {
  className?: string;
  /** Tailwind size classes for the Spera icon, e.g. "h-7 w-7". */
  iconClassName?: string;
  /** Render the "SpinTribe" wordmark next to the mark. */
  showWordmark?: boolean;
  /** Override classes for the wordmark text. */
  wordmarkClassName?: string;
};

/**
 * Canonical SpinTribe lockup: the iconic Spera "S" mark with an "ST" superscript
 * badge, optionally followed by the SpinTribe wordmark. Shared across the public
 * landing and the authenticated shell so the brand reads as one product. The
 * "ST" pill reuses the 3-stop brand gradient via the `gradient-primary` utility.
 */
export function BrandMark({
  className,
  iconClassName = "h-7 w-7",
  showWordmark = false,
  wordmarkClassName = "text-xl font-black tracking-tight text-foreground",
}: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative inline-flex shrink-0">
        <SperaIcon className={iconClassName} title="SpinTribe" />
        <span
          aria-hidden
          className="gradient-primary absolute -right-2 -top-1.5 rounded-md px-1 text-[8px] font-black leading-[1.45] text-white"
          style={{ boxShadow: "0 0 8px rgba(255, 75, 53, 0.45)" }}
        >
          ST
        </span>
      </span>
      {showWordmark && <span className={wordmarkClassName}>SpinTribe</span>}
    </span>
  );
}

export function SperaWordmark({ className, title = "spera" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 760 220"
      role="img"
      aria-label={title}
      className={cn("block", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="spera-wordmark-gradient" x1="25" y1="58" x2="184" y2="174" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff7a2f" />
          <stop offset="0.5" stopColor="#ff2d55" />
          <stop offset="1" stopColor="#e0007a" />
        </linearGradient>
      </defs>
      <path
        d="M164 63H92C57.2 63 29 91.2 29 126s28.2 63 63 63h31"
        stroke="url(#spera-wordmark-gradient)"
        strokeWidth="45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56 157h72c34.8 0 63-28.2 63-63s-28.2-63-63-63H97"
        stroke="url(#spera-wordmark-gradient)"
        strokeWidth="45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56 157h71.5c18 0 31.5-13.4 31.5-31.5"
        stroke="var(--background)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M164 63H92.5C74.5 63 61 76.4 61 94.5"
        stroke="var(--background)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="260"
        y="151"
        fill="currentColor"
        fontFamily="Lexend, Inter, Arial, Helvetica, sans-serif"
        fontSize="118"
        fontWeight="800"
        letterSpacing="-2"
      >
        spera
      </text>
    </svg>
  );
}
