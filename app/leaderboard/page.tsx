"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { buildLeaderboard } from "@/lib/mock-data";
import { Tier, TIER_LABELS, canAccessChampionFeatures } from "@/lib/types";
import { CHALLENGE_TIERS, getGhostPacerKm } from "@/lib/challenge";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import { SperaIcon } from "@/components/SperaLogo";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = CHALLENGE_TIERS;

const MEDAL_STYLES: Record<number, { border: string; glow: string }> = {
  1: { border: "#FFD700", glow: "0 0 12px rgba(255,215,0,0.4)" },
  2: { border: "#C0C0C0", glow: "0 0 12px rgba(192,192,192,0.3)" },
  3: { border: "#CD7F32", glow: "0 0 12px rgba(205,127,50,0.3)" },
};

export default function LeaderboardPage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, users, activities } = useStore();
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  const realUsers = useMemo(() => users.filter((u) => u.isConnected && u.leaderboardConsent), [users]);
  const activeTier = selectedTier ?? currentUser?.tier ?? 400;
  const entries   = useMemo(
    () => buildLeaderboard(activeTier, realUsers, activities),
    [activeTier, realUsers, activities]
  );
  const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const ghostTargetKm = getGhostPacerKm(entries, activeTier);

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-[#020202] mb-nav">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">
            {monthLabel} monthly distance
          </p>
          <h1 className="font-bold text-[#ffffff] text-xl">Leaderboard</h1>
        </div>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">

        {/* Tier tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TIERS.map((t) => {
            const active = activeTier === t;
            return (
              <button
                key={t}
                onClick={() => setSelectedTier(t)}
                className={cn(
                  "flex-shrink-0 rounded-full px-4 py-1.5 text-[11px] font-semibold border transition-all",
                  active
                    ? "border-[#ff4b35]/60 text-[#ff4b35]"
                    : "border-white/10 text-[#b8b8b8] hover:border-white/20"
                )}
                style={active ? {
                  background: "rgba(255,75,53,0.15)",
                  boxShadow: "0 0 12px rgba(255,75,53,0.25)",
                } : undefined}
              >
                {t} km - {TIER_LABELS[t]}
              </button>
            );
          })}
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35]">
                {TIER_LABELS[activeTier]} monthly distance rank
              </p>
              <p className="mt-1 text-[11px] text-[#b8b8b8]/70 leading-snug">
                Ranked by {monthLabel} Strava cycling km in the {activeTier} km tier. Opted-in riders only.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <p className="text-[10px] text-[#b8b8b8]">{entries.length} riders</p>
              <PoweredByStrava />
            </div>
          </div>
        </div>

        <div className="glass-card p-4" style={{ borderColor: "rgba(255,75,53,0.35)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35]">Ghost Rider pacer</p>
              <p className="mt-1 text-[11px] text-[#b8b8b8]/70 leading-snug">
                Target to chase: {ghostTargetKm} km. Pacer only. Not a real rider. Not counted in rank.
              </p>
            </div>
            <p className="text-2xl font-black text-[#ff4b35]">{ghostTargetKm}</p>
          </div>
        </div>

        {/* Entries */}
        {entries.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-sm text-[#b8b8b8]">No opted-in riders in this tier yet.</p>
            <p className="text-[11px] text-[#b8b8b8]/50 mt-1">Leaderboard rank appears after riders consent and sync monthly rides.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const isMe    = entry.user.id === currentUser.id;
              const medal   = MEDAL_STYLES[entry.rank];
              const isChamp = canAccessChampionFeatures(entry.user);

              return (
                <div
                  key={entry.user.id}
                  className="glass-card p-4 transition-all"
                  style={isMe ? {
                    borderColor: "rgba(255,75,53,0.5)",
                    background: "linear-gradient(135deg, rgba(255,75,53,0.08) 0%, rgba(255,255,255,0.04) 100%)",
                  } : medal ? {
                    borderColor: medal.border + "50",
                    boxShadow: medal.glow,
                  } : undefined}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank / medal */}
                    <div className="flex items-center justify-center w-7 flex-shrink-0">
                      <span className="text-sm font-bold text-[#b8b8b8] w-6 text-center">#{entry.rank}</span>
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
                        <p className="font-bold text-sm text-[#ffffff] truncate max-w-[120px]">
                          {entry.user.name.split(" ")[0]}
                        </p>
                        {isChamp && (
                          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                            style={{ background: "rgba(255,75,53,0.2)", color: "#ff4b35" }}>
                            CHAMP
                          </span>
                        )}
                        {isMe && (
                          <span className="text-[9px] rounded-full px-1.5 py-0.5 font-bold"
                            style={{ background: "rgba(255,255,255,0.15)", color: "#ffffff" }}>
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${entry.progressPct}%`,
                            background: "linear-gradient(90deg, #ff4b35, #ffffff)",
                            boxShadow: "0 0 6px rgba(255,255,255,0.4)",
                          }} />
                      </div>
                    </div>

                    {/* KM */}
                    <div className="text-right flex-shrink-0 ml-1">
                      <p className="font-bold text-base text-[#ff4b35]">{entry.totalKm}</p>
                      <p className="text-[10px] text-[#b8b8b8]">monthly km</p>
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
