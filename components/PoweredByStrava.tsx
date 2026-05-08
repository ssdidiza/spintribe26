import Link from "next/link";
import Image from "next/image";

/**
 * Official "Powered by Strava" badge per Strava API branding guidelines.
 * https://developers.strava.com/guidelines/
 * Uses the white horizontal logo (correct for dark backgrounds).
 * Must link to strava.com.
 */
export default function PoweredByStrava({ className = "" }: { className?: string }) {
  return (
    <Link
      href="https://www.strava.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center ${className}`}
      aria-label="Powered by Strava"
    >
      <Image
        src="/strava/powered_by_strava_white.svg"
        alt="Powered by Strava"
        width={96}
        height={23}
        className="h-4 w-auto"
        unoptimized
      />
    </Link>
  );
}
