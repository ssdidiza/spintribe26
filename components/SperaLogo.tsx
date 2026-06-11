import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
};

export function SperaIcon({ className, title = "SpinTribe" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 220 220"
      role="img"
      aria-label={title}
      className={cn("block", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image href="/icon.svg" x="0" y="0" width="220" height="220" preserveAspectRatio="xMidYMid meet" />
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

export function SperaWordmark({ className, title = "SpinTribe" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 760 220"
      role="img"
      aria-label={title}
      className={cn("block", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image href="/icon.svg" x="0" y="0" width="220" height="220" preserveAspectRatio="xMidYMid meet" />
      <text
        x="260"
        y="151"
        fill="currentColor"
        fontFamily="Lexend, Inter, Arial, Helvetica, sans-serif"
        fontSize="118"
        fontWeight="800"
        letterSpacing="0"
      >
        SpinTribe
      </text>
    </svg>
  );
}
