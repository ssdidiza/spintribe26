"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { buildLeaderboard } from "@/lib/mock-data";
import { Tier, TIER_LABELS, canAccessChampionFeatures } from "@/lib/types";
import NavBar from "@/components/NavBar";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = [200, 400, 800, 1000];

const MEDAL_STYLES: Record<number, { border: string; glow: string; emoji: string }> = {
  1: { border: "#FFD700", glow: "0 0 12px rgba(255,215,0,0.4)",  emoji: "🥇" },
  2: { border: "#C0C0C0", glow: "0 0 12px rgba(192,192,192,0.3)", emoji: "🥈" },
  3: { border: "#CD7F32", glow: "0 0 12px rgba(205,127,50,0.3)",  emoji: "🥉" },
};

export default function LeaderboardPage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, users, activities } = useStore();
  const [selectedTier, setSelectedTier] = useState<Tier>(400);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
    else setSelectedTier(currentUser.tier as Tier);
  }, [hydrated, currentUser, isOnboarded, router]);

  if (!hydrated || !currentUser) return null;

  const realUsers = users.filter((u) => u.isConnected);
  const entries   = buildLeaderboard(selectedTier, realUsers, activities);

  return (
    <div className="min-h-screen bg-[#131313] mb-nav">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
            {new Date().toLocaleString("default", { month: "long", year: "numeric" })}
          </p>
          <h1 className="font-bold text-[#e5e2e1] text-xl">Leaderboard</h1>
        </div>
        <svg viewBox="0 0 24 24" className="w-5 h-5" style={{ opacity: 0.4 }} fill="#cdbdff">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 17.944h4.172" />
        </svg>
      </header>

      <main className="max-w-lg mx-auto px-5 py-5 space-y-4">

        {/* Tier tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TIERS.map((t) => {
            const active = selectedTier === t;
            return (
              <button
                key={t}
                onClick={() => setSelectedTier(t)}
                className={cn(
                  "flex-shrink-0 rounded-full px-4 py-1.5 text-[11px] font-semibold border transition-all",
                  active
                    ? "border-[#7c4dff]/60 text-[#cdbdff]"
                    : "border-white/10 text-[#cac3d8] hover:border-white/20"
                )}
                style={active ? {
                  background: "rgba(124,77,255,0.15)",
                  boxShadow: "0 0 12px rgba(124,77,255,0.25)",
                } : undefined}
              >
                {t} km · {TIER_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Entry count */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cdbdff]">
            {TIER_LABELS[selectedTier]} — {selectedTier} km
          </p>
          <p className="text-[10px] text-[#cac3d8]">{entries.length} riders</p>
        </div>

        {/* Entries */}
        {entries.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-[#cac3d8] text-sm">No riders in this tier yet.</p>
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
                    borderColor: "rgba(124,77,255,0.5)",
                    background: "linear-gradient(135deg, rgba(124,77,255,0.08) 0%, rgba(0,227,253,0.04) 100%)",
                  } : medal ? {
                    borderColor: medal.border + "50",
                    boxShadow: medal.glow,
                  } : undefined}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank / medal */}
                    <div className="flex items-center justify-center w-7 flex-shrink-0">
                      {medal
                        ? <span className="text-xl">{medal.emoji}</span>
                        : <span className="text-sm font-bold text-[#cac3d8] w-6 text-center">{entry.rank}</span>
                      }
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
                        <p className="font-bold text-sm text-[#e5e2e1] truncate max-w-[120px]">
                          {entry.user.name.split(" ")[0]}
                        </p>
                        {isChamp && (
                          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                            style={{ background: "rgba(124,77,255,0.2)", color: "#cdbdff" }}>
                            CHAMP
                          </span>
                        )}
                        {isMe && (
                          <span className="text-[9px] rounded-full px-1.5 py-0.5 font-bold"
                            style={{ background: "rgba(0,227,253,0.15)", color: "#00e3fd" }}>
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${entry.progressPct}%`,
                            background: "linear-gradient(90deg, #7c4dff, #00e3fd)",
                            boxShadow: "0 0 6px rgba(0,227,253,0.4)",
                          }} />
                      </div>
                    </div>

                    {/* KM */}
                    <div className="text-right flex-shrink-0 ml-1">
                      <p className="font-bold text-base text-[#cdbdff]">{entry.totalKm}</p>
                      <p className="text-[10px] text-[#cac3d8]">/ {entry.targetKm} km</p>
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
