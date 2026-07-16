"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import LeagueStatus from "@/components/LeagueStatus";
import { SperaIcon } from "@/components/SperaLogo";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import type { LeaderboardApiResponse, LeaderboardEntry, Tier } from "@/lib/types";
import {
  LEAGUES,
  LEAGUE_METRICS,
  formatLeagueRange,
  getMetricRankKey,
  getMetricValue,
  type LeaderboardMetric,
} from "@/lib/leagues";
import { cn } from "@/lib/utils";
import { BarChart3, CalendarDays, Mountain, Route, ShieldCheck, Trophy, User } from "lucide-react";

type LeagueApiResponse = {
  current: {
    monthlyKm: number;
    totalElevation: number;
    league: { tier: Tier; name: string; minKm: number; maxKm: number | null; accent: string; description: string };
    nextLeague: { name: string } | null;
    promotionTargetKm: number;
    remainingKm: number;
    progressPct: number;
    rankDistance: number | null;
    rankElevation: number | null;
    rankConsistency: number | null;
    fastTrackedThisMonth: boolean;
  };
  history: {
    monthKey: string;
    assignedKm: number;
    leagueName: string;
    leagueThreshold: Tier;
  }[];
};

function metricUnit(metric: LeaderboardMetric) {
  return LEAGUE_METRICS.find((item) => item.id === metric)?.shortLabel ?? "";
}

function formatMetric(metric: LeaderboardMetric, entry: LeaderboardEntry) {
  const value = getMetricValue(metric, entry);
  if (metric === "elevation") return `${value.toLocaleString()} m`;
  if (metric === "consistency") return `${value} days`;
  if (metric === "ride_count") return `${value} rides`;
  return `${value} km`;
}

function getRankForMetric(metric: LeaderboardMetric, entry: LeaderboardEntry) {
  const key = getMetricRankKey(metric);
  return Number(entry[key as keyof LeaderboardEntry] ?? entry.rank);
}

export default function LeaguesPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded } = useStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardApiResponse | null>(null);
  const [leagueData, setLeagueData] = useState<LeagueApiResponse | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<Tier | null>(null);
  const [metric, setMetric] = useState<LeaderboardMetric>("distance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activationError = useMemo(() => {
    if (typeof window === "undefined") return "";
    const code = new URLSearchParams(window.location.search).get("error");
    if (!code) return "";
    if (code === "strava_linked_elsewhere") return "That Strava profile is already active on another account.";
    if (code === "strava_denied") return "Strava activation was cancelled. Your booking account is unchanged.";
    return "Strava could not be activated. Please try again.";
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (currentUser.isConnected && !isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser?.isConnected || !isOnboarded) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [leaderboardRes, leaguesRes] = await Promise.all([
          fetch("/api/leaderboard", { signal: controller.signal }),
          fetch("/api/leagues", { signal: controller.signal }),
        ]);
        if (!leaderboardRes.ok || !leaguesRes.ok) throw new Error("League data unavailable");
        const [leaderboardJson, leaguesJson] = await Promise.all([
          leaderboardRes.json() as Promise<LeaderboardApiResponse>,
          leaguesRes.json() as Promise<LeagueApiResponse>,
        ]);
        setLeaderboard(leaderboardJson);
        setLeagueData(leaguesJson);
        setSelectedLeague((league) => league ?? leaguesJson.current.league.tier);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Could not load live league data.");
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded]);

  const activeLeague = selectedLeague ?? currentUser?.currentLeagueThreshold ?? currentUser?.tier ?? 400;
  const entries = useMemo(() => {
    const rows = leaderboard?.tiers[String(activeLeague)]?.entries ?? [];
    return [...rows].sort((a, b) =>
      getMetricValue(metric, b) - getMetricValue(metric, a) ||
      b.totalKm - a.totalKm ||
      a.user.name.localeCompare(b.user.name)
    );
  }, [activeLeague, leaderboard, metric]);
  const myEntry = entries.find((entry) => entry.user.id === currentUser?.id);
  const activeDefinition = LEAGUES.find((league) => league.tier === activeLeague) ?? LEAGUES[1];

  if (!hydrated || !currentUser) return null;

  if (!currentUser.isConnected) {
    return (
      <div className="min-h-screen bg-background mb-nav">
        <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
              Optional rider experience
            </p>
            <h1 className="font-bold text-foreground text-xl">SpinTribe League</h1>
          </div>
          <SperaIcon className="h-7 w-7" />
        </header>

        <main className="mx-auto flex min-h-[calc(100vh-150px)] w-full max-w-lg items-center px-5 py-8">
          <section className="glass-card w-full overflow-hidden p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fc4c02]/10 text-[#fc4c02]">
              <Trophy size={24} />
            </div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-[#fc4c02]">Your rides. Your league.</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground">
              Activate the league with Strava.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Your coaching account is ready. Connect Strava only when you want verified rides to count toward monthly league progress.
            </p>

            <div className="mt-6 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.025] p-4">
              <div className="flex gap-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent-foreground" />
                <p className="text-xs leading-5 text-muted-foreground">
                  Booking, payment, and reminders stay on your normal account. Strava is used only for ride verification and league progress.
                </p>
              </div>
            </div>

            {activationError && (
              <p role="alert" className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-600 dark:text-red-300">
                {activationError}
              </p>
            )}

            <a
              href="/api/auth/strava?link=1"
              className="mt-7 flex min-h-14 w-full items-center justify-center rounded-xl bg-[#fc4c02] px-6 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4c02] focus-visible:ring-offset-4 focus-visible:ring-offset-background active:translate-y-0"
            >
              <Image
                src="/strava/btn_connect_with_strava_white.svg"
                alt="Connect with Strava"
                width={193}
                height={48}
                className="h-10 w-auto"
              />
            </a>
            <p className="mt-4 text-center text-[10px] leading-4 text-muted-foreground/70">
              You can keep booking coaching without activating the league.
            </p>
          </section>
        </main>
        <NavBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Monthly leagues
          </p>
          <h1 className="font-bold text-foreground text-xl">Leagues</h1>
        </div>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">
        <LeagueStatus
          leagueName={leagueData?.current.league.name ?? `${currentUser.tier} Club`}
          monthlyKm={leagueData?.current.monthlyKm ?? 0}
          promotionTargetKm={leagueData?.current.promotionTargetKm ?? currentUser.tier}
          remainingKm={leagueData?.current.remainingKm ?? 0}
          progressPct={leagueData?.current.progressPct ?? 0}
          nextLeagueName={leagueData?.current.nextLeague?.name ?? null}
          leagueMinKm={leagueData?.current.league.minKm ?? 0}
          fastTracked={leagueData?.current.fastTrackedThisMonth}
          rank={leagueData?.current.rankDistance ?? null}
          variant="card"
        />

        {leagueData?.history && leagueData.history.length > 0 && (
          <section className="glass-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-accent-foreground" />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">League progression</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {leagueData.history.map((item) => (
                <div key={item.monthKey} className="min-w-28 rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{item.monthKey}</p>
                  <p className="mt-1 text-sm font-black text-foreground">{item.leagueName}</p>
                  <p className="mt-0.5 text-[10px] text-accent-foreground">{item.assignedKm} km</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {LEAGUES.map((league) => {
            const active = activeLeague === league.tier;
            const riderCount = leaderboard?.tiers[String(league.tier)]?.count ?? null;
            return (
              <button
                key={league.tier}
                type="button"
                onClick={() => setSelectedLeague(league.tier)}
                className={cn(
                  "flex-shrink-0 rounded-full border px-4 py-2 text-[11px] font-black transition-all",
                  active
                    ? "border-[#ff4b35]/60 bg-[#ff4b35]/15 text-accent-foreground"
                    : "border-foreground/10 text-muted-foreground hover:border-foreground/20"
                )}
              >
                {league.name}
                {riderCount !== null && (
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black",
                      active ? "bg-[#ff4b35]/25 text-accent-foreground" : "bg-foreground/[0.08] text-muted-foreground"
                    )}
                  >
                    {riderCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <section className="glass-card p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">
                {activeDefinition.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {formatLeagueRange(activeDefinition)} band. Rankings are filtered inside this league.
              </p>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground">
              {loading ? "Loading" : `${entries.length} riders`}
            </p>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {LEAGUE_METRICS.map((item) => {
              const active = metric === item.id;
              const Icon = item.id === "elevation" ? Mountain : item.id === "consistency" ? CalendarDays : item.id === "ride_count" ? BarChart3 : item.id === "longest_ride" ? Trophy : Route;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMetric(item.id)}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-[9px] font-black transition-all",
                    active
                      ? "border-[#ff4b35]/55 bg-[#ff4b35]/15 text-accent-foreground"
                      : "border-foreground/[0.08] bg-foreground/[0.03] text-muted-foreground"
                  )}
                  title={item.label}
                >
                  <Icon size={14} />
                  {item.shortLabel}
                </button>
              );
            })}
          </div>
        </section>

        {error && <p className="glass-card p-3 text-xs text-muted-foreground">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] rounded-2xl glass animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <section className="glass-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {error ? "Live league tables could not be loaded." : "No opted-in riders in this league yet."}
            </p>
          </section>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const rank = getRankForMetric(metric, entry);
              const isMe = entry.user.id === currentUser.id;
              return (
                <div
                  key={entry.user.id}
                  className="glass-card p-4"
                  style={isMe ? { borderColor: "rgba(255,75,53,0.5)", background: "linear-gradient(135deg, rgba(255,75,53,0.08), var(--glass-card-base))" } : undefined}
                >
                  <div className="grid grid-cols-[2rem_2.5rem_1fr_auto] items-center gap-3">
                    <p className="text-sm font-black text-muted-foreground">#{rank}</p>
                    {entry.user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
                        <User size={18} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-black text-foreground">{entry.user.name}</p>
                        {isMe && <span className="rounded-full bg-[#ff4b35]/15 px-1.5 py-0.5 text-[9px] font-black text-accent-foreground">YOU</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {entry.user.teamName ?? entry.user.zone ?? "SpinTribe"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-accent-foreground">{formatMetric(metric, entry)}</p>
                      <p className="text-[9px] text-muted-foreground">{metricUnit(metric)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {myEntry && (
          <section className="glass-card p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Your row</p>
            <p className="mt-2 text-sm text-muted-foreground">
              You are #{getRankForMetric(metric, myEntry)} in {activeDefinition.name} for {LEAGUE_METRICS.find((item) => item.id === metric)?.label.toLowerCase()}.
            </p>
          </section>
        )}
      </main>
      <NavBar />
    </div>
  );
}

