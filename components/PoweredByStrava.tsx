import Link from "next/link";

/**
 * "Powered by Strava" badge — required by Strava API guidelines wherever
 * Strava-sourced data is displayed. Links to strava.com as required.
 * https://developers.strava.com/guidelines/
 */
export default function PoweredByStrava({ className = "" }: { className?: string }) {
  return (
    <Link
      href="https://www.strava.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label="Powered by Strava"
    >
      <svg viewBox="0 0 24 24" className="w-3 h-3 flex-shrink-0" fill="#FC4C02" aria-hidden="true">
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 17.944h4.172" />
      </svg>
      <span className="text-[9px] font-semibold tracking-wide" style={{ color: "#FC4C02" }}>
        Powered by Strava
      </span>
    </Link>
  );
}
