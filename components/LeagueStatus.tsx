import { Trophy, TrendingUp, ShieldAlert, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LeagueStatusData {
  leagueName: string;
  monthlyKm: number;
  promotionTargetKm: number;
  remainingKm: number;
  progressPct: number;
  nextLeagueName?: string | null;
  leagueMinKm: number;
  fastTracked?: boolean;
  rank?: number | null;
  leagueRiders?: number | null;
}

interface LeagueStatusProps extends LeagueStatusData {
  variant?: "hero" | "card" | "compact";
  className?: string;
}

/**
 * Single, reusable league-first status surface. Leagues are identity; promotion
 * is the only progression. Shows current club, progress toward the next club,
 * fast-track status, and month-end relegation risk. Used on Dashboard, Leagues,
 * Profile, Teams, and Zones so the league story reads the same everywhere.
 */
export default function LeagueStatus({
  leagueName,
  monthlyKm,
  promotionTargetKm,
  remainingKm,
  progressPct,
  nextLeagueName,
  leagueMinKm,
  fastTracked,
  rank,
  leagueRiders,
  variant = "card",
  className,
}: LeagueStatusProps) {
  const relegationKm = Math.max(0, leagueMinKm - monthlyKm);
  const atRiskOfRelegation = relegationKm > 0;

  const promotionLine = nextLeagueName
    ? `${remainingKm} km to ${nextLeagueName}`
    : "Top league — every km strengthens your standing";

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center justify-between gap-3 rounded-2xl border border-[#ff4b35]/25 bg-[#ff4b35]/[0.08] px-4 py-3", className)}>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">Your league</p>
          <p className="truncate text-lg font-black text-foreground">{leagueName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-foreground">{nextLeagueName ? `${remainingKm} km` : "Top"}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {nextLeagueName ? `to ${nextLeagueName}` : "league"}
          </p>
        </div>
      </div>
    );
  }

  const isHero = variant === "hero";

  return (
    <section
      className={cn("glass-card relative overflow-hidden p-5", className)}
      style={{ borderColor: "rgba(255,75,53,0.34)" }}
    >
      {isHero && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-[min(460px,100%)] -translate-x-1/2"
          style={{ background: "radial-gradient(50% 60% at 50% 30%, rgba(255,75,53,0.18), transparent 70%)" }}
        />
      )}

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">Current league</p>
          <h2 className={cn("mt-2 font-black leading-none tracking-tight text-foreground", isHero ? "text-4xl sm:text-5xl" : "text-3xl")}>
            {leagueName}
          </h2>
          {fastTracked && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#ff4b35]/40 bg-[#ff4b35]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-accent-foreground">
              <Zap size={10} /> Fast-tracked this month
            </span>
          )}
        </div>
        {rank != null && (
          <div className="rounded-2xl border border-[#ff4b35]/30 bg-[#ff4b35]/10 px-3 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">League rank</p>
            <p className="text-2xl font-black text-accent-foreground">{`#${rank}`}</p>
            {leagueRiders != null && <p className="text-[9px] text-muted-foreground">{leagueRiders} riders</p>}
          </div>
        )}
      </div>

      <div className="relative mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
            <TrendingUp size={12} /> Promotion progress
          </p>
          <p className="text-xs font-bold text-foreground">{monthlyKm} / {promotionTargetKm} km</p>
        </div>
        <div className="h-3 rounded-full bg-foreground/[0.08] p-0.5">
          <div
            className="gradient-primary h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%`, boxShadow: "0 0 16px rgba(255,75,53,0.35)" }}
          />
        </div>

        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Trophy size={14} className="text-accent-foreground" />
          {promotionLine}
        </p>

        {atRiskOfRelegation && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#ff7a2f]">
            <ShieldAlert size={13} />
            {relegationKm} km needed this month to stay in the {leagueName}
          </p>
        )}
      </div>
    </section>
  );
}
