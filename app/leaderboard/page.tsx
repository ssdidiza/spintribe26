"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { buildLeaderboard } from "@/lib/mock-data";
import { LeaderboardApiResponse, LeaderboardEntry, Tier, TIER_LABELS, canAccessChampionFeatures } from "@/lib/types";
import { CHALLENGE_TIERS } from "@/lib/challenge";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import { BrandMark } from "@/components/SperaLogo";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = CHALLENGE_TIERS;
const ALL_REGIONS = "All regions";

type RankingMode = "distance" | "consistency";

const RANKING_MODES: { id: RankingMode; label: string; description: string }[] = [
  { id: "distance", label: "Distance", description: "Monthly km" },
  { id: "consistency", label: "Consistency", description: "Ride days" },
];

const MEDAL_STYLES: Record<number, { border: string; glow: string }> = {
  1: { border: "#FFD700", glow: "0 0 12px rgba(255,215,0,0.4)" },
  2: { border: "#C0C0C0", glow: "0 0 12px rgba(192,192,192,0.3)" },
  3: { border: "#CD7F32", glow: "0 0 12px rgba(205,127,50,0.3)" },
};

function formatMonthKey(monthKey?: string) {
  if (!monthKey) {
    return new Date().toLocaleString("default", { month: "long", year: "numeric" });
  }
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    return new Date().toLocaleString("default", { month: "long", year: "numeric" });
  }
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

function getRegionLabel(entry: LeaderboardEntry) {
  return entry.user.region || entry.user.zone || entry.user.country || "Unspecified";
}

export default function LeaderboardPage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, users, activities } = useStore();
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [liveLeaderboard, setLiveLeaderboard] = useState<LeaderboardApiResponse | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [rankingMode, setRankingMode] = useState<RankingMode>("distance");
  const [selectedRegion, setSelectedRegion] = useState(ALL_REGIONS);
  const currentUserId = currentUser?.id;

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUserId || !isOnboarded) return;
    const controller = new AbortController();

    async function loadLeaderboard() {
      setBoardLoading(true);
      setBoardError("");
      try {
        const res = await fetch("/api/leaderboard", { signal: controller.signal });
        if (!res.ok) {
          setBoardError("Live leaderboard unavailable. Showing local fallback.");
          return;
        }
        const data = await res.json() as LeaderboardApiResponse;
        setLiveLeaderboard(data);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setBoardError("Live leaderboard unavailable. Showing local fallback.");
        }
      } finally {
        setBoardLoading(false);
      }
    }

    void loadLeaderboard();
    return () => controller.abort();
  }, [hydrated, currentUserId, isOnboarded]);

  const realUsers = useMemo(() => users.filter((u) => u.isConnected && u.leaderboardConsent !== false), [users]);
  const activeTier = selectedTier ?? currentUser?.tier ?? 400;
  const localEntries = useMemo(
    () => buildLeaderboard(activeTier, realUsers, activities),
    [activeTier, realUsers, activities]
  );
  const liveTier = liveLeaderboard?.tiers[String(activeTier)];
  const entries = liveTier?.entries ?? localEntries;
  const monthLabel = formatMonthKey(liveLeaderboard?.monthKey);
  const dayOfMonth = new Date().getDate();

  const regionOptions = useMemo(
    () => Array.from(new Set(entries.map(getRegionLabel))).sort((a, b) => a.localeCompare(b)),
    [entries]
  );
  const activeRegion = selectedRegion === ALL_REGIONS || regionOptions.includes(selectedRegion)
    ? selectedRegion
    : ALL_REGIONS;

  const visibleRows = useMemo(() => {
    const filtered = activeRegion === ALL_REGIONS
      ? entries
      : entries.filter((entry) => getRegionLabel(entry) === activeRegion);
    const sorted = rankingMode === "consistency"
      ? [...filtered].sort((a, b) =>
          (b.rideDays ?? 0) - (a.rideDays ?? 0) ||
          b.totalKm - a.totalKm ||
          a.user.name.localeCompare(b.user.name)
        )
      : filtered;

    return sorted.map((entry, index) => ({
      entry,
      displayRank: activeRegion === ALL_REGIONS && rankingMode === "distance"
        ? entry.rank
        : index + 1,
    }));
  }, [activeRegion, entries, rankingMode]);

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {monthLabel} monthly distance
          </p>
          <h1 className="font-bold text-foreground text-xl">Leaderboard</h1>
        </div>
        <BrandMark iconClassName="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">

        {/* Tier tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TIERS.map((t) => {
            const active = activeTier === t;
            const count = liveLeaderboard?.tiers[String(t)]?.count;
            return (
              <button
                key={t}
                onClick={() => setSelectedTier(t)}
                className={cn(
                  "flex-shrink-0 rounded-full px-4 py-1.5 text-[11px] font-semibold border transition-all",
                  active
                    ? "border-[#ff4b35]/60 text-accent-foreground"
                    : "border-foreground/10 text-muted-foreground hover:border-foreground/20"
                )}
                style={active ? {
                  background: "rgba(255,75,53,0.15)",
                  boxShadow: "0 0 12px rgba(255,75,53,0.25)",
                } : undefined}
              >
                {t} km - {TIER_LABELS[t]}
                {count !== undefined && (
                  <span className="ml-1 text-[10px] opacity-70">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="glass-card p-3">
          <div className="grid grid-cols-2 gap-2">
            {RANKING_MODES.map((mode) => {
              const active = rankingMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setRankingMode(mode.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left transition-all",
                    active
                      ? "border-[#ff4b35]/55 bg-[#ff4b35]/15"
                      : "border-foreground/10 bg-foreground/[0.03] hover:border-foreground/20"
                  )}
                >
                  <span className={cn("block text-xs font-black", active ? "text-[#ff4b35]" : "text-foreground")}>
                    {mode.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground/70">
                    {mode.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[ALL_REGIONS, ...regionOptions].map((region) => {
              const active = activeRegion === region;
              return (
                <button
                  key={region}
                  type="button"
                  onClick={() => setSelectedRegion(region)}
                  className={cn(
                    "flex-shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold transition-all",
                    active
                      ? "border-[#ff4b35]/60 text-[#ff4b35]"
                      : "border-foreground/10 text-muted-foreground hover:border-foreground/20"
                  )}
                  style={active ? { background: "rgba(255,75,53,0.12)" } : undefined}
                >
                  {region}
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-foreground">
                {TIER_LABELS[activeTier]} monthly {rankingMode} rank
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/70 leading-snug">
                {rankingMode === "distance"
                  ? `Ranked by ${monthLabel} Strava cycling km in the ${activeTier} km tier.`
                  : `Ranked by unique ride days in ${monthLabel}; ties use monthly km.`}
                {" "}Opted-in riders only.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <p className="text-[10px] text-muted-foreground">
                {boardLoading ? "Refreshing" : `${visibleRows.length} riders`}
              </p>
              <PoweredByStrava />
            </div>
          </div>
        </div>

        {boardError && (
          <div className="glass-card p-3 text-[11px] text-muted-foreground">
            {boardError}
          </div>
        )}

        {/* Entries */}
        {visibleRows.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-sm text-muted-foreground">No opted-in riders match this view yet.</p>
            <p className="text-[11px] text-muted-foreground/50 mt-1">Leaderboard rank appears after riders consent and sync monthly rides.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map(({ entry, displayRank }) => {
              const isMe    = entry.user.id === currentUser.id;
              const medal   = MEDAL_STYLES[displayRank];
              const isChamp = canAccessChampionFeatures(entry.user);
              const modeProgressPct = rankingMode === "consistency"
                ? Math.min(100, Math.round(((entry.rideDays ?? 0) / Math.max(1, dayOfMonth)) * 100))
                : entry.progressPct;

              return (
                <div
                  key={entry.user.id}
                  className="glass-card p-4 transition-all"
                  style={isMe ? {
                    borderColor: "rgba(255,75,53,0.5)",
                    background: "linear-gradient(135deg, rgba(255,75,53,0.08) 0%, var(--fill-soft) 100%)",
                  } : medal ? {
                    borderColor: medal.border + "50",
                    boxShadow: medal.glow,
                  } : undefined}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank / medal */}
                    <div className="flex items-center justify-center w-7 flex-shrink-0">
                      <span className="text-sm font-bold text-muted-foreground w-6 text-center">#{displayRank}</span>
                    </div>

                    {/* Avatar */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.user.avatar}
                      alt={entry.user.name}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      style={medal ? { border: `2px solid ${medal.border}`, boxShadow: medal.glow } : undefined}
                    />

                    {/* Name & progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <p className="font-bold text-sm text-foreground truncate max-w-[150px]">
                          {entry.user.name.split(" ")[0]}
                        </p>
                        {isChamp && (
                          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                            style={{ background: "rgba(255,75,53,0.2)", color: "var(--accent-foreground)" }}>
                            CHAMP
                          </span>
                        )}
                        {isMe && (
                          <span className="text-[9px] rounded-full px-1.5 py-0.5 font-bold"
                            style={{ background: "var(--fill-mid)", color: "var(--foreground)" }}>
                            YOU
                          </span>
                        )}
                      </div>
                      <p className="mb-1.5 truncate text-[10px] text-muted-foreground/60">
                        {getRegionLabel(entry)}
                        {rankingMode === "consistency" && entry.totalKm > 0 ? ` - ${entry.totalKm} km` : ""}
                      </p>
                      <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${modeProgressPct}%`,
                            background: "linear-gradient(90deg, #ff7a2f, #ff3b30, #e0007a)",
                            boxShadow: "0 0 6px rgba(255,75,53,0.4)",
                          }} />
                      </div>
                    </div>

                    {/* KM */}
                    <div className="text-right flex-shrink-0 ml-1">
                      <p className="font-bold text-base text-accent-foreground">
                        {rankingMode === "consistency" ? (entry.rideDays ?? 0) : entry.totalKm}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {rankingMode === "consistency" ? "ride days" : "monthly km"}
                      </p>
                      {rankingMode === "consistency" && entry.consistencyRank && activeRegion !== ALL_REGIONS && (
                        <p className="text-[9px] text-muted-foreground/50">SA #{entry.consistencyRank}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <NavBar />
    </div>
  );
}
