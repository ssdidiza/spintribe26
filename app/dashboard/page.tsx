"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm } from "@/lib/mock-data";
import { LeaderboardApiResponse } from "@/lib/types";
import { canRequestTierUpgrade, getMonthlyActivityInsights, getNextTier } from "@/lib/challenge";
import { formatLeagueRange, getLeagueByTier, getLeagueProgress, type LeagueDefinition } from "@/lib/leagues";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import NotificationBanner from "@/components/NotificationBanner";
import { BrandMark } from "@/components/SperaLogo";
import {
  AlertTriangle,
  Bike,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Route,
  PartyPopper,
  RefreshCw,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { format } from "date-fns";

type LeagueApiSummary = {
  current: {
    monthlyKm: number;
    totalElevation: number;
    league: LeagueDefinition;
    nextLeague: LeagueDefinition | null;
    promotionTargetKm: number;
    remainingKm: number;
    progressPct: number;
    rankDistance: number | null;
    rankElevation: number | null;
    rankConsistency: number | null;
    leagueRiders: number;
  };
};

type TeamsApiSummary = {
  currentUserTeamId: string | null;
  teams: {
    id: string;
    name: string;
    slug: string;
    averageLeagueLevel: number;
    ridersPromoted: number;
    totalDistanceKm: number;
    activeRiders: number;
    isCurrentUserTeam: boolean;
  }[];
  unassigned?: {
    count: number;
    totalDistanceKm: number;
    activeRiders: number;
  };
};

type ZonesApiSummary = {
  zones: {
    id: string;
    name: string;
    region: string;
    totalDistanceKm: number;
    totalElevation: number;
    participationRate: number;
    promotions: number;
  }[];
};

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const {
    currentUser, isOnboarded, activities,
    syncStravaActivities, hydrateChampionSessions, hydrateAthleteData, hydrateActivities,
  } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [refreshingFtp, setRefreshingFtp] = useState(false);
  const [upgradeState, setUpgradeState] = useState<"idle" | "sending" | "sent" | "blocked">("idle");
  const [liveLeaderboard, setLiveLeaderboard] = useState<LeaderboardApiResponse | null>(null);
  const [leagueSummary, setLeagueSummary] = useState<LeagueApiSummary | null>(null);
  const [teamsSummary, setTeamsSummary] = useState<TeamsApiSummary | null>(null);
  const [zonesSummary, setZonesSummary] = useState<ZonesApiSummary | null>(null);
  const [rankingsStatus, setRankingsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [communityRefreshNonce, setCommunityRefreshNonce] = useState(0);
  const currentUserId = currentUser?.id;

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await syncStravaActivities();
    setSyncing(false);
  }, [syncStravaActivities]);

  const handleFtpRefresh = useCallback(async () => {
    setRefreshingFtp(true);
    await hydrateAthleteData();
    setRefreshingFtp(false);
  }, [hydrateAthleteData]);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    Promise.all([hydrateChampionSessions(), hydrateAthleteData(), hydrateActivities()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentUserId, isOnboarded]);

  useEffect(() => {
    if (!hydrated || !currentUserId || !isOnboarded) return;
    const controller = new AbortController();

    async function fetchJson<T>(url: string): Promise<T | null> {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        return await res.json() as T;
      } catch (error) {
        if ((error as Error).name === "AbortError") throw error;
        return null;
      }
    }

    async function loadCommunityData() {
      try {
        const [leaderboardJson, leaguesJson, teamsJson, zonesJson] = await Promise.all([
          fetchJson<LeaderboardApiResponse>("/api/leaderboard"),
          fetchJson<LeagueApiSummary>("/api/leagues"),
          fetchJson<TeamsApiSummary>("/api/teams"),
          fetchJson<ZonesApiSummary>("/api/zones"),
        ]);
        setLiveLeaderboard(leaderboardJson);
        setLeagueSummary(leaguesJson);
        if (teamsJson) setTeamsSummary(teamsJson);
        if (zonesJson) setZonesSummary(zonesJson);
        setRankingsStatus(leaderboardJson ? "ready" : "error");
      } catch {
        // Aborted (navigation/unmount) — leave state as-is.
      }
    }

    void loadCommunityData();
    return () => controller.abort();
  }, [hydrated, currentUserId, isOnboarded, communityRefreshNonce]);

  const userActivities = useMemo(
    () => activities
      .filter((a) => a.userId === currentUser?.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [activities, currentUser?.id]
  );

  const monthLabel = format(new Date(), "MMMM yyyy");
  const monthlyActivities = useMemo(() => {
    const now = new Date();
    return userActivities.filter((a) => {
      const activityDate = new Date(a.date);
      return activityDate.getMonth() === now.getMonth() && activityDate.getFullYear() === now.getFullYear();
    });
  }, [userActivities]);

  const monthlyKm = useMemo(
    () => currentUser ? getMonthlyKm(currentUser.id, activities) : 0,
    [currentUser, activities]
  );
  const monthlyInsights = useMemo(
    () => currentUser ? getMonthlyActivityInsights(currentUser.id, activities) : null,
    [currentUser, activities]
  );

  // The league a rider competes in is owned by the server (Supabase
  // current_league_threshold via /api/leagues). The locally persisted tier is
  // only a fallback while that request is in flight — it can be stale, and
  // keying rankings off it previously made riders look alone in their league.
  const effectiveLeagueTier =
    leagueSummary?.current.league.tier ??
    currentUser?.currentLeagueThreshold ??
    currentUser?.tier ??
    null;
  const leaderboardEntries = useMemo(() => {
    if (!effectiveLeagueTier) return [];
    return liveLeaderboard?.tiers[String(effectiveLeagueTier)]?.entries ?? [];
  }, [effectiveLeagueTier, liveLeaderboard]);
  const currentRankEntry = useMemo(
    () => leaderboardEntries.find((e) => e.user.id === currentUserId),
    [leaderboardEntries, currentUserId]
  );
  const topTeams = teamsSummary?.teams.slice(0, 3) ?? [];
  const topZones = zonesSummary?.zones.slice(0, 3) ?? [];

  if (!hydrated || !currentUser) return null;

  const targetKm    = currentUser.tier;
  const pct         = Math.min(100, Math.round((monthlyKm / targetKm) * 100));
  const remainingKm = Math.max(0, targetKm - monthlyKm);
  const totalMoving = monthlyInsights?.totalMovingTime ?? 0;
  const avgKm       = monthlyInsights?.averageRideKm ?? 0;
  const longestRideKm = monthlyInsights?.longestRideKm ?? 0;
  const rideDays = monthlyInsights?.rideDays ?? 0;
  const activeWeeksThisMonth = monthlyInsights?.activeWeeksThisMonth ?? 0;
  const lastSyncedRide = monthlyInsights?.lastSyncedRide;
  const ftp = currentUser.ftp;
  const now = new Date();
  const leagueTier = effectiveLeagueTier ?? currentUser.tier;
  const fallbackLeague = getLeagueByTier(leagueTier);
  const fallbackLeagueProgress = getLeagueProgress(monthlyKm, leagueTier);
  const heroLeague = leagueSummary?.current.league ?? fallbackLeague;
  const heroNextLeague = leagueSummary?.current.nextLeague ?? fallbackLeagueProgress.nextLeague;
  const heroRemainingKm = leagueSummary?.current.remainingKm ?? fallbackLeagueProgress.remainingKm;
  const heroProgressPct = leagueSummary?.current.progressPct ?? fallbackLeagueProgress.progressPct;
  const heroPromotionTargetKm = leagueSummary?.current.promotionTargetKm ?? fallbackLeagueProgress.promotionTargetKm;
  const heroRankDistance = leagueSummary?.current.rankDistance ?? currentRankEntry?.rank ?? null;
  const heroLeagueRiders = leagueSummary?.current.leagueRiders ?? leaderboardEntries.length;

  // ── Progress pace calculations ────────────────────────────────────────────
  const daysInMonth     = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth      = now.getDate();
  const daysLeft        = daysInMonth - dayOfMonth;
  const expectedKmByNow = (targetKm / daysInMonth) * dayOfMonth;
  const paceKmPerDay    = dayOfMonth > 0 ? monthlyKm / dayOfMonth : 0;
  const projectedTotal  = Math.round(paceKmPerDay * daysInMonth);
  const kmNeededPerDay  = daysLeft > 0 ? Math.ceil(remainingKm / daysLeft) : 0;
  const targetPacePerDay = targetKm / daysInMonth;
  const paceRatio       = expectedKmByNow > 0 ? monthlyKm / expectedKmByNow : (monthlyKm > 0 ? 2 : 0);

  type ProgressStatus = "complete" | "great" | "on_track" | "behind";
  const progressStatus: ProgressStatus =
    pct >= 100        ? "complete" :
    paceRatio >= 1.1  ? "great"    :
    paceRatio >= 0.82 ? "on_track" :
                        "behind";

  // Status colors are kept as hex (they are composed with alpha suffixes below)
  // and chosen to stay legible on both light and dark surfaces.
  const STATUS_CONFIG: Record<ProgressStatus, { label: string; Icon: typeof Trophy; color: string; bg: string; border: string }> = {
    complete: { label: "Challenge Complete!", Icon: PartyPopper,   color: "#ff4b35", bg: "rgba(255,75,53,0.12)",   border: "rgba(255,75,53,0.35)"   },
    great:    { label: "Doing Great",         Icon: Flame,         color: "#ff7a2f", bg: "rgba(255,122,47,0.12)",  border: "rgba(255,122,47,0.32)"  },
    on_track: { label: "On Track",            Icon: CheckCircle2,  color: "#16a34a", bg: "rgba(22,163,74,0.10)",   border: "rgba(22,163,74,0.30)"   },
    behind:   { label: "Falling Behind",      Icon: AlertTriangle, color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)"  },
  };
  const statusCfg  = STATUS_CONFIG[progressStatus];
  const StatusIcon = statusCfg.Icon;
  const leaderboardScope = `${monthLabel} Strava distance - ${heroLeague.name} - opted-in riders`;
  const upgradeOffer = canRequestTierUpgrade(currentUser, activities, now);
  const pinnaclePush = !getNextTier(currentUser.tier) && pct >= 100;

  async function requestUpgrade() {
    if (!upgradeOffer || upgradeState === "sending") return;
    setUpgradeState("sending");
    const res = await fetch("/api/tier-upgrades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedTier: upgradeOffer.requestedTier }),
    });
    setUpgradeState(res.ok || res.status === 409 ? "sent" : "blocked");
  }

  const STATS = [
    { label: "Ride days",   value: rideDays,                                             icon: <CalendarCheck size={14} className="text-accent-foreground" /> },
    { label: "Avg ride",    value: avgKm ? `${avgKm} km` : "-",                          icon: <TrendingUp size={14} className="text-foreground" /> },
    { label: "Longest",     value: longestRideKm ? `${longestRideKm} km` : "-",          icon: <Route      size={14} className="text-[#ec4899]" /> },
    { label: "Month time",  value: formatDuration(totalMoving),                          icon: <Clock      size={14} className="text-[#ec4899]" /> },
    { label: "Month rank",  value: currentRankEntry ? `#${currentRankEntry.rank}` : "-", icon: <Trophy     size={14} className="text-accent-foreground" /> },
  ];

  const MEDALS = ["#1", "#2", "#3"];

  return (
    <div className="min-h-screen bg-background mb-nav">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {monthLabel}
          </p>
          <h1 className="font-bold text-foreground text-base leading-tight truncate max-w-[200px]">
            {currentUser.name.split(/[\s"]/)[0]}
          </h1>
          <a
            href="https://open.spotify.com/playlist/05H398jB0GTyf6M30oi2Nv"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-0.5 rounded-full px-2 py-0.5 transition-opacity hover:opacity-100 opacity-70"
            style={{ background: "rgba(30,215,96,0.12)", border: "1px solid rgba(30,215,96,0.25)" }}
          >
            <span style={{ color: "#1ED760", fontSize: 9 }}>Play</span>
            <span className="text-[9px] font-semibold tracking-wide" style={{ color: "#1ED760" }}>Now Playing</span>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <BrandMark iconClassName="h-6 w-6" />
          <span className="text-[10px] font-bold rounded-full px-2.5 py-1 border border-[#ff4b35]/40"
            style={{ color: "var(--accent-foreground)", background: "rgba(255,75,53,0.1)" }}>
            {heroLeague.name}
          </span>
          <button onClick={handleSync} disabled={syncing}
            className="w-8 h-8 rounded-full glass flex items-center justify-center text-muted-foreground disabled:opacity-40 hover:text-accent-foreground transition-colors">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-6 space-y-5">

        <NotificationBanner />

        <section
          className="glass-card relative overflow-hidden p-5"
          style={{ borderColor: "rgba(255,75,53,0.34)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-[min(460px,100%)] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(50% 60% at 50% 30%, rgba(255,75,53,0.18), transparent 70%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">
                Current league
              </p>
              <h2 className="mt-2 text-4xl font-black leading-none tracking-tight text-foreground sm:text-5xl">
                {heroLeague.name}
              </h2>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {formatLeagueRange(heroLeague)} monthly band
              </p>
            </div>
            <div className="rounded-2xl border border-[#ff4b35]/30 bg-[#ff4b35]/10 px-3 py-2 text-right">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">League rank</p>
              <p className="text-2xl font-black text-accent-foreground">
                {heroRankDistance ? `#${heroRankDistance}` : "-"}
              </p>
              <p className="text-[9px] text-muted-foreground">{heroLeagueRiders} riders</p>
            </div>
          </div>

          <div className="relative mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                  Promotion progress
                </p>
                <p className="text-xs font-bold text-foreground">
                  {monthlyKm} / {heroPromotionTargetKm} km
                </p>
              </div>
              <div className="h-3 rounded-full bg-foreground/[0.08] p-0.5">
                <div
                  className="gradient-primary h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${heroProgressPct}%`,
                    boxShadow: "0 0 16px rgba(255,75,53,0.35)",
                  }}
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {heroNextLeague
                  ? `${heroRemainingKm} km to promotion into the ${heroNextLeague.name}.`
                  : heroRemainingKm > 0
                    ? `${heroRemainingKm} km to defend your ${heroLeague.name} floor.`
                    : `You are riding inside the top league. Every extra kilometre strengthens your standing.`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:w-52">
              <MiniLeagueStat label="Remaining" value={`${heroRemainingKm} km`} />
              <MiniLeagueStat label="Progress" value={`${heroProgressPct}%`} />
            </div>
          </div>
        </section>

        {/* ── League rankings strip (live Supabase data only) ───────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
              {heroLeague.name} Rankings
            </p>
            <a href="/leagues" className="flex items-center gap-0.5 text-[10px] font-semibold text-accent-foreground/70 hover:text-accent-foreground transition-colors">
              See all <ChevronRight size={12} />
            </a>
          </div>
          {rankingsStatus === "loading" && leaderboardEntries.length === 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 flex-shrink-0 rounded-2xl glass animate-pulse" style={{ width: 88 }} />
              ))}
            </div>
          ) : rankingsStatus === "error" && leaderboardEntries.length === 0 ? (
            <div className="glass-card p-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Live rankings are temporarily unavailable, so we won&apos;t guess who is around you.
                Your rides are safe.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRankingsStatus("loading");
                  setCommunityRefreshNonce((nonce) => nonce + 1);
                }}
                className="mt-2 text-[11px] font-bold text-accent-foreground underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          ) : leaderboardEntries.length === 0 ? (
            <div className="glass-card p-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                No opted-in riders in the {heroLeague.name} yet this month.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                {leaderboardEntries.slice(0, 6).map((entry, i) => {
                  const isMe = entry.user.id === currentUser.id;
                  return (
                    <div
                      key={entry.user.id}
                      className="flex-shrink-0 rounded-2xl p-3 flex flex-col items-center gap-2"
                      style={{
                        width: 88,
                        background: isMe
                          ? "linear-gradient(160deg, rgba(255,75,53,0.18), rgba(255,75,53,0.06))"
                          : "var(--fill-soft)",
                        border: `1px solid ${isMe ? "rgba(255,75,53,0.4)" : "var(--border)"}`,
                      }}
                    >
                      <span className="text-base leading-none">{MEDALS[i] ?? `#${entry.rank}`}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.user.avatar}
                        alt={entry.user.name}
                        className="w-9 h-9 rounded-full object-cover"
                        style={isMe ? { border: "2px solid #ff4b35" } : {}}
                      />
                      <p className="text-[10px] font-bold text-foreground truncate w-full text-center">
                        {entry.user.name.split(" ")[0]}
                      </p>
                      <div className="w-full h-1 rounded-full bg-foreground/[0.08] overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${entry.progressPct}%`, background: isMe ? "#ff4b35" : "var(--muted-foreground)" }} />
                      </div>
                      <p className="text-[9px] font-semibold" style={{ color: isMe ? "var(--accent-foreground)" : "var(--muted-foreground)" }}>
                        {entry.totalKm} km
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground/60 leading-snug">
                Ranked by {leaderboardScope}. Not champing, FTP, average pace, or moving time.
              </p>
            </>
          )}
        </div>

        {(teamsSummary || zonesSummary) && (
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryRankingCard
              title="Team Rankings"
              icon={<Users size={15} />}
              href="/teams"
              rows={topTeams.map((team) => ({
                key: team.id,
                name: team.isCurrentUserTeam ? `${team.name} (you)` : team.name,
                meta: `${team.ridersPromoted} promoted - ${team.activeRiders} active`,
                value: `${team.averageLeagueLevel || "-"} avg`,
              }))}
              footer={
                teamsSummary?.unassigned && teamsSummary.unassigned.count > 0
                  ? {
                      name: teamsSummary.currentUserTeamId ? "Unassigned Riders" : "Unassigned Riders (you)",
                      meta: `${teamsSummary.unassigned.count} rider${teamsSummary.unassigned.count === 1 ? "" : "s"} without a team`,
                      value: `${teamsSummary.unassigned.totalDistanceKm} km`,
                    }
                  : undefined
              }
              empty={
                teamsSummary && !teamsSummary.currentUserTeamId
                  ? "You're riding unassigned. Join a team or create your own to unlock team rankings."
                  : "Join or create a team to unlock team development rankings."
              }
            />
            <SummaryRankingCard
              title="Zone Rankings"
              icon={<Route size={15} />}
              href="/zones"
              rows={topZones.map((zone) => ({
                key: zone.id,
                name: zone.name,
                meta: `${zone.region} - ${zone.participationRate}% participation`,
                value: `${zone.totalDistanceKm} km`,
              }))}
              empty="Zone rankings build from GPS-detected rides and riders' profile zones. Set your zone in your profile to count for your area."
            />
          </div>
        )}

        {/* ── Progress tracking card ────────────────────────────────────── */}
        <div
          className="glass-card p-5"
          style={{ borderColor: statusCfg.border, background: statusCfg.bg }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <StatusIcon size={17} style={{ color: statusCfg.color }} />
              <span className="text-sm font-black tracking-tight" style={{ color: statusCfg.color }}>
                {statusCfg.label}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              Day {dayOfMonth} of {daysInMonth}
            </span>
          </div>

          {progressStatus !== "complete" ? (
            <>
              <div className="relative h-2 rounded-full bg-foreground/[0.06] overflow-visible mb-4">
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full opacity-50"
                  style={{ left: `${Math.min(99, (expectedKmByNow / targetKm) * 100)}%`, background: "var(--muted-foreground)" }}
                />
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${statusCfg.color}99, ${statusCfg.color})`, boxShadow: `0 0 8px ${statusCfg.color}66` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground/60 -mt-3 mb-4">
                <span>0</span>
                <span>expected</span>
                <span>{targetKm} km</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center rounded-xl p-3 bg-foreground/[0.03] border border-foreground/[0.05]">
                  <p className="text-lg font-black" style={{ color: statusCfg.color }}>
                    {paceRatio > 0 ? `${Math.round(paceRatio * 100)}%` : "-"}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">of pace</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-foreground/[0.03] border border-foreground/[0.05]">
                  <p className="text-lg font-black text-foreground">{targetPacePerDay.toFixed(1)}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">target pace</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-foreground/[0.03] border border-foreground/[0.05]">
                  <p className="text-lg font-black text-foreground">{projectedTotal}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">km projected</p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground/70 mt-3 leading-snug">
                {progressStatus === "behind"
                  ? `You need ${kmNeededPerDay} km/day for the remaining ${daysLeft} day${daysLeft !== 1 ? "s" : ""} to hit ${targetKm} km.`
                  : progressStatus === "great"
                  ? `At your current pace you'll finish around ${projectedTotal} km - ${projectedTotal - targetKm} km over target.`
                  : `You're right on pace. Keep riding near ${targetPacePerDay.toFixed(1)} km/day to secure your ${targetKm} km goal.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              You&apos;ve hit your {targetKm} km target with {daysLeft} day{daysLeft !== 1 ? "s" : ""} to spare. Keep riding - every km now is a bonus.
            </p>
          )}
        </div>

        {/* ── 4-stat bento ─────────────────────────────────────────────── */}
        {(upgradeOffer || pinnaclePush) && (
          <div className="glass-card p-5" style={{ borderColor: "rgba(255,75,53,0.35)" }}>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-foreground mb-2">
              {pinnaclePush ? "Unicorn mode" : "You have outgrown this league"}
            </p>
            {upgradeOffer ? (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You completed {upgradeOffer.currentTier} km. Request a next-month move to {upgradeOffer.requestedTier} km so this month&apos;s leaderboard stays fair.
                </p>
                <button
                  type="button"
                  onClick={requestUpgrade}
                  disabled={upgradeState === "sending" || upgradeState === "sent"}
                  className="mt-3 w-full rounded-2xl py-3 text-xs font-black tracking-widest text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#ff4b35,#e0007a)" }}
                >
                  {upgradeState === "sent" ? "REQUEST SENT" : upgradeState === "sending" ? "SENDING..." : `REQUEST ${upgradeOffer.requestedTier} KM LEAGUE`}
                </button>
                {upgradeState === "blocked" && (
                  <p className="mt-2 text-[10px] text-destructive">Could not send the request. Try again after your next sync.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                You are riding beyond the official leagues. Unicorn is club-only stretch mode unless Team Vitality confirms it for rewards.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STATS.map(({ label, value, icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1">{icon}</div>
              <p className="text-lg font-bold text-foreground">{value}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        <div className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-foreground">Personal insights</p>
              <p className="mt-1 text-[11px] text-muted-foreground/65">From your synced rides this month.</p>
            </div>
            <span className="rounded-full border border-foreground/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
              You only
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              ["Projected", `${projectedTotal} km`],
              ["Needed / day", pct >= 100 ? "Complete" : `${kmNeededPerDay} km`],
              ["Active weeks", String(activeWeeksThisMonth)],
              ["Ride count", String(monthlyActivities.length)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-black text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {lastSyncedRide ? (
            <a
              href={`https://www.strava.com/activities/${lastSyncedRide.stravaId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 transition-colors hover:border-[#FC4C02]/30"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Last synced ride</p>
                <p className="mt-1 truncate text-sm font-bold text-foreground">{lastSyncedRide.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">{format(new Date(lastSyncedRide.date), "MMM d")}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-accent-foreground">{(lastSyncedRide.distance / 1000).toFixed(1)} km</p>
                <p className="text-[10px] text-muted-foreground">{formatDuration(lastSyncedRide.movingTime)}</p>
              </div>
            </a>
          ) : (
            <div className="mt-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-sm text-muted-foreground">
              No synced rides yet this month.
            </div>
          )}
        </div>

        {/* ── FTP (only shown when set — personal data, not shared) ────── */}
        {ftp && (
          <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Fitness Benchmarks</p>
              <button
                type="button"
                onClick={handleFtpRefresh}
                disabled={refreshingFtp}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-all hover:border-[#ff4b35]/40 hover:text-accent-foreground disabled:opacity-40"
              >
                <RefreshCw size={10} className={refreshingFtp ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">FTP - Functional Threshold Power</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black" style={{ color: "var(--accent-foreground)" }}>{ftp}</span>
                <span className="text-sm text-muted-foreground mb-1">watts</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Power Zones</p>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: "Z1", pct: 55,  from: "#a3a3a8", to: "#c4c4c8" },
                  { label: "Z2", pct: 75,  from: "#c4c4c8", to: "#ff7a2f" },
                  { label: "Z3", pct: 90,  from: "#ff7a2f", to: "#ff4b35" },
                  { label: "Z4", pct: 105, from: "#ff4b35", to: "#da1e67" },
                  { label: "Z5", pct: 120, from: "#da1e67", to: "#b3155a" },
                ].map((z) => (
                  <div key={z.label} className="text-center">
                    <div className="h-2 rounded-full mb-1"
                      style={{ background: `linear-gradient(90deg, ${z.from}, ${z.to})` }} />
                    <p className="text-[9px] font-semibold text-muted-foreground">{z.label}</p>
                    <p className="text-[8px] text-muted-foreground/60">{Math.round(ftp * z.pct / 100)}W</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Synced Strava rides ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Synced Strava Rides</p>
            {syncing
              ? <span className="text-[10px] text-muted-foreground">Syncing...</span>
              : <PoweredByStrava />}
          </div>
          {syncing && monthlyActivities.length === 0 ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl glass animate-pulse" />)}</div>
          ) : monthlyActivities.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-muted-foreground text-sm">No rides for {format(now, "MMMM")}.</p>
              <button onClick={handleSync} className="mt-3 text-xs underline underline-offset-2 text-accent-foreground">Sync Strava</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {monthlyActivities.slice(0, 8).map((activity) => (
                <a
                  key={activity.id}
                  href={`https://www.strava.com/activities/${activity.stravaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 glass-card p-3 hover:border-[#FC4C02]/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl glass flex items-center justify-center text-accent-foreground flex-shrink-0">
                    <Bike size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{activity.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(activity.date), "MMM d")}
                      {activity.detectedZoneId && (
                        <span className="ml-1.5 text-foreground/70">- {activity.detectedZoneId.replace(/^[a-z]+-/, "").replace(/-/g, " ")}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-accent-foreground">{(activity.distance / 1000).toFixed(1)} km</p>
                    <p className="text-[10px] text-muted-foreground">{formatDuration(activity.movingTime)}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* ── Sync ─────────────────────────────────────────────────────── */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full rounded-2xl py-3 font-semibold text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-40 text-muted-foreground hover:text-foreground"
          style={{ background: "var(--fill-soft)", border: "1px solid var(--border)" }}
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing Strava..." : "Sync with Strava"}
        </button>

      </main>
      <NavBar />
    </div>
  );
}

function MiniLeagueStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.035] p-3 text-center">
      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-black text-foreground">{value}</p>
    </div>
  );
}

function SummaryRankingCard({
  title,
  icon,
  href,
  rows,
  footer,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  rows: { key: string; name: string; meta: string; value: string }[];
  footer?: { name: string; meta: string; value: string };
  empty: string;
}) {
  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#ff4b35]/12 text-accent-foreground">
            {icon}
          </span>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        </div>
        <a href={href} className="text-[10px] font-bold text-accent-foreground/75 hover:text-accent-foreground">
          View
        </a>
      </div>
      {rows.length > 0 || footer ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
              <p className="text-xs font-black text-muted-foreground">#{index + 1}</p>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-foreground">{row.name}</p>
                <p className="truncate text-[9px] text-muted-foreground/70">{row.meta}</p>
              </div>
              <p className="text-xs font-black text-accent-foreground">{row.value}</p>
            </div>
          ))}
          {footer && (
            <div className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-xl border border-dashed border-foreground/[0.12] bg-foreground/[0.02] p-2.5">
              <p className="text-xs font-black text-muted-foreground/60">-</p>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-foreground/80">{footer.name}</p>
                <p className="truncate text-[9px] text-muted-foreground/70">{footer.meta}</p>
              </div>
              <p className="text-xs font-black text-muted-foreground">{footer.value}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-xs leading-relaxed text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}
