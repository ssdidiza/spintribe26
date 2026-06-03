"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm, buildLeaderboard } from "@/lib/mock-data";
import { TIER_LABELS } from "@/lib/types";
import { canRequestTierUpgrade, getGhostPacerKm, getNextTier } from "@/lib/challenge";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import NotificationBanner from "@/components/NotificationBanner";
import { SperaIcon } from "@/components/SperaLogo";
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  PartyPopper,
  RefreshCw,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { format } from "date-fns";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const {
    currentUser, isOnboarded, activities, users,
    syncStravaActivities, hydrateChampionSessions, hydrateAthleteData, hydrateActivities,
  } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [refreshingFtp, setRefreshingFtp] = useState(false);
  const [ghostUnlocked, setGhostUnlocked] = useState(() => (
    typeof window !== "undefined" && localStorage.getItem("spera-ghost-rider") === "1"
  ));
  const [ghostTapCount, setGhostTapCount] = useState(0);
  const [upgradeState, setUpgradeState] = useState<"idle" | "sending" | "sent" | "blocked">("idle");
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

  // Only include users who have consented to leaderboard sharing
  const consentedUsers = useMemo(
    () => users.filter((u) => u.isConnected && u.leaderboardConsent),
    [users]
  );

  const leaderboardEntries = useMemo(
    () => currentUser ? buildLeaderboard(currentUser.tier, consentedUsers, activities) : [],
    [currentUser, consentedUsers, activities]
  );
  const currentRankEntry = useMemo(
    () => leaderboardEntries.find((e) => e.user.id === currentUser?.id),
    [leaderboardEntries, currentUser?.id]
  );

  if (!hydrated || !currentUser) return null;

  const targetKm    = currentUser.tier;
  const pct         = Math.min(100, Math.round((monthlyKm / targetKm) * 100));
  const remainingKm = Math.max(0, targetKm - monthlyKm);
  const totalMoving = monthlyActivities.reduce((s, a) => s + a.movingTime, 0);
  const avgKm       = monthlyActivities.length
    ? Math.round(monthlyActivities.reduce((s, a) => s + a.distance, 0) / 1000 / monthlyActivities.length)
    : 0;
  const ftp = currentUser.ftp;
  const now = new Date();

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

  const STATUS_CONFIG: Record<ProgressStatus, { label: string; Icon: typeof Trophy; color: string; bg: string; border: string }> = {
    complete: { label: "Challenge Complete!", Icon: PartyPopper,   color: "#ff4b35", bg: "rgba(255,75,53,0.12)",   border: "rgba(255,75,53,0.35)"   },
    great:    { label: "Doing Great",         Icon: Flame,         color: "#ffffff", bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.22)" },
    on_track: { label: "On Track",            Icon: CheckCircle2,  color: "#ffffff", bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.25)" },
    behind:   { label: "Falling Behind",      Icon: AlertTriangle, color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)"  },
  };
  const statusCfg  = STATUS_CONFIG[progressStatus];
  const StatusIcon = statusCfg.Icon;
  const leaderboardScope = `${monthLabel} Strava distance - ${TIER_LABELS[currentUser.tier]} ${currentUser.tier} km tier - opted-in riders`;
  const ghostTargetKm = getGhostPacerKm(leaderboardEntries, currentUser.tier, now);
  const ghostGapKm = Math.max(0, ghostTargetKm - monthlyKm);
  const upgradeOffer = canRequestTierUpgrade(currentUser, activities, now);
  const pinnaclePush = !getNextTier(currentUser.tier) && pct >= 100;

  function handleGhostTap() {
    const next = ghostTapCount + 1;
    setGhostTapCount(next);
    if (next >= 3) {
      setGhostUnlocked(true);
      localStorage.setItem("spera-ghost-rider", "1");
    }
  }

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
    { label: "Month rides", value: monthlyActivities.length,                             icon: <Bike       size={14} className="text-[#ff4b35]" /> },
    { label: "Avg / ride",  value: avgKm,                                                icon: <TrendingUp size={14} className="text-[#ffffff]" /> },
    { label: "Month time",  value: formatDuration(totalMoving),                          icon: <Clock      size={14} className="text-[#ffb1c1]" /> },
    { label: "Month rank",  value: currentRankEntry ? `#${currentRankEntry.rank}` : "-", icon: <Trophy     size={14} className="text-[#ff4b35]" /> },
  ];

  const MEDALS = ["#1", "#2", "#3"];

  return (
    <div className="min-h-screen bg-[#020202] mb-nav">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">
            {monthLabel}
          </p>
          <h1 className="font-bold text-[#ffffff] text-base leading-tight truncate max-w-[200px]">
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
          <button
            type="button"
            onClick={handleGhostTap}
            className="w-8 h-8 rounded-full glass flex items-center justify-center hover:border-[#ff4b35]/40 transition-colors"
            aria-label="Unlock Ghost Rider"
          >
            <SperaIcon className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-bold rounded-full px-2.5 py-1 border border-[#ff4b35]/40"
            style={{ color: "#ff4b35", background: "rgba(255,75,53,0.1)" }}>
            {TIER_LABELS[currentUser.tier]} - {currentUser.tier} km
          </span>
          <button onClick={handleSync} disabled={syncing}
            className="w-8 h-8 rounded-full glass flex items-center justify-center text-[#b8b8b8] disabled:opacity-40 hover:text-[#ff4b35] transition-colors">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-6 space-y-5">

        <NotificationBanner />

        {/* ── Cinematic hero ────────────────────────────────────────────── */}
        <div className="relative text-center pt-4 pb-2">
          <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#b8b8b8]/50 mb-3">
            {monthLabel} monthly distance
          </p>
          <div className="flex items-end justify-center gap-2 mb-1">
            <span
              className="font-black leading-none"
              style={{
                fontSize: "clamp(5rem, 22vw, 7.5rem)",
                color: "#ffffff",
                letterSpacing: "-0.04em",
                textShadow: "0 0 60px rgba(255,75,53,0.25)",
              }}
            >
              {monthlyKm}
            </span>
            <span className="text-2xl font-light text-[#b8b8b8]/70 pb-3">km</span>
          </div>
          <p className="text-sm text-[#b8b8b8]/50 mb-4">
            {currentRankEntry ? `Monthly distance rank #${currentRankEntry.rank} of ${leaderboardEntries.length} - ` : ""}
            {pct}% of {targetKm} km
          </p>
          <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[240px] mx-auto">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #ff4b35, #ffffff)", boxShadow: "0 0 6px rgba(255,255,255,0.5)" }} />
          </div>
        </div>

        {/* ── Team Pulse — horizontal leaderboard strip ─────────────────── */}
        {leaderboardEntries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">
                {TIER_LABELS[currentUser.tier]} Monthly Distance
              </p>
              <a href="/leaderboard" className="flex items-center gap-0.5 text-[10px] font-semibold text-[#ff4b35]/70 hover:text-[#ff4b35] transition-colors">
                See all <ChevronRight size={12} />
              </a>
            </div>
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
                        : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isMe ? "rgba(255,75,53,0.4)" : "rgba(255,255,255,0.07)"}`,
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
                    <p className="text-[10px] font-bold text-[#ffffff] truncate w-full text-center">
                      {entry.user.name.split(" ")[0]}
                    </p>
                    <div className="w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${entry.progressPct}%`, background: isMe ? "#ff4b35" : "rgba(255,255,255,0.5)" }} />
                    </div>
                    <p className="text-[9px] font-semibold" style={{ color: isMe ? "#ff4b35" : "#b8b8b8" }}>
                      {entry.totalKm} km
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-[#b8b8b8]/60 leading-snug">
              Ranked by {leaderboardScope}. Not champing, FTP, average pace, or moving time.
            </p>
          </div>
        )}

        <div
          className="glass-card p-4"
          style={{
            borderColor: ghostUnlocked ? "rgba(255,75,53,0.45)" : "rgba(255,255,255,0.08)",
            background: ghostUnlocked ? "linear-gradient(135deg, rgba(255,75,53,0.12), rgba(255,255,255,0.04))" : undefined,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35]">
                {ghostUnlocked ? "Ghost Rider unlocked" : "Ghost Rider pacer"}
              </p>
              <p className="mt-1 text-sm font-bold text-[#ffffff]">Target to chase: {ghostTargetKm} km</p>
              <p className="mt-1 text-[11px] text-[#b8b8b8]/70 leading-snug">
                Pacer only. Not a real rider. Not counted in rank. {ghostGapKm > 0 ? `${ghostGapKm} km to catch it.` : "You are ahead of the ghost."}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-black text-[#ff4b35]">{ghostTargetKm}</p>
              <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8]">pacer km</p>
            </div>
          </div>
        </div>

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
            <span className="text-[10px] font-semibold text-[#b8b8b8]">
              Day {dayOfMonth} of {daysInMonth}
            </span>
          </div>

          {progressStatus !== "complete" ? (
            <>
              <div className="relative h-2 rounded-full bg-white/[0.06] overflow-visible mb-4">
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full opacity-50"
                  style={{ left: `${Math.min(99, (expectedKmByNow / targetKm) * 100)}%`, background: "#b8b8b8" }}
                />
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${statusCfg.color}99, ${statusCfg.color})`, boxShadow: `0 0 8px ${statusCfg.color}66` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[#b8b8b8]/60 -mt-3 mb-4">
                <span>0</span>
                <span>expected</span>
                <span>{targetKm} km</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black" style={{ color: statusCfg.color }}>
                    {paceRatio > 0 ? `${Math.round(paceRatio * 100)}%` : "-"}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8] mt-0.5">of pace</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black text-[#ffffff]">{targetPacePerDay.toFixed(1)}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8] mt-0.5">target pace</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black text-[#ffffff]">{projectedTotal}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8] mt-0.5">km projected</p>
                </div>
              </div>

              <p className="text-[11px] text-[#b8b8b8]/70 mt-3 leading-snug">
                {progressStatus === "behind"
                  ? `You need ${kmNeededPerDay} km/day for the remaining ${daysLeft} day${daysLeft !== 1 ? "s" : ""} to hit ${targetKm} km.`
                  : progressStatus === "great"
                  ? `At your current pace you'll finish around ${projectedTotal} km - ${projectedTotal - targetKm} km over target.`
                  : `You're right on pace. Keep riding near ${targetPacePerDay.toFixed(1)} km/day to secure your ${targetKm} km goal.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-[#b8b8b8] leading-relaxed">
              You&apos;ve hit your {targetKm} km target with {daysLeft} day{daysLeft !== 1 ? "s" : ""} to spare. Keep riding - every km now is a bonus.
            </p>
          )}
        </div>

        {/* ── 4-stat bento ─────────────────────────────────────────────── */}
        {(upgradeOffer || pinnaclePush) && (
          <div className="glass-card p-5" style={{ borderColor: "rgba(255,75,53,0.35)" }}>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35] mb-2">
              {pinnaclePush ? "Unicorn mode" : "You have outgrown this league"}
            </p>
            {upgradeOffer ? (
              <>
                <p className="text-sm text-[#b8b8b8] leading-relaxed">
                  You completed {upgradeOffer.currentTier} km. Request a next-month move to {upgradeOffer.requestedTier} km so this month&apos;s leaderboard stays fair.
                </p>
                <button
                  type="button"
                  onClick={requestUpgrade}
                  disabled={upgradeState === "sending" || upgradeState === "sent"}
                  className="mt-3 w-full rounded-2xl py-3 text-xs font-black tracking-widest text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#ff4b35,#ffffff)" }}
                >
                  {upgradeState === "sent" ? "REQUEST SENT" : upgradeState === "sending" ? "SENDING..." : `REQUEST ${upgradeOffer.requestedTier} KM LEAGUE`}
                </button>
                {upgradeState === "blocked" && (
                  <p className="mt-2 text-[10px] text-[#ffb4ab]">Could not send the request. Try again after your next sync.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-[#b8b8b8] leading-relaxed">
                You are riding beyond the official leagues. Unicorn is club-only stretch mode unless Team Vitality confirms it for rewards.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {STATS.map(({ label, value, icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1">{icon}</div>
              <p className="text-lg font-bold text-[#ffffff]">{value}</p>
              <p className="text-[9px] text-[#b8b8b8] mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* ── FTP (only shown when set — personal data, not shared) ────── */}
        {ftp && (
          <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Fitness Benchmarks</p>
              <button
                type="button"
                onClick={handleFtpRefresh}
                disabled={refreshingFtp}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-[#b8b8b8] transition-all hover:border-[#ff4b35]/40 hover:text-[#ff4b35] disabled:opacity-40"
              >
                <RefreshCw size={10} className={refreshingFtp ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
            <div>
              <p className="text-[10px] text-[#b8b8b8] uppercase tracking-wider mb-1">FTP - Functional Threshold Power</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black" style={{ color: "#ff4b35" }}>{ftp}</span>
                <span className="text-sm text-[#b8b8b8] mb-1">watts</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#b8b8b8] uppercase tracking-wider mb-2">Power Zones</p>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: "Z1", pct: 55,  from: "#ffffff44", to: "#ffffff66" },
                  { label: "Z2", pct: 75,  from: "#ffffff66", to: "#ff4b3566" },
                  { label: "Z3", pct: 90,  from: "#ff4b3566", to: "#ff4b3599" },
                  { label: "Z4", pct: 105, from: "#ff4b35aa", to: "#da1e67aa" },
                  { label: "Z5", pct: 120, from: "#da1e6799", to: "#da1e67cc" },
                ].map((z) => (
                  <div key={z.label} className="text-center">
                    <div className="h-2 rounded-full mb-1"
                      style={{ background: `linear-gradient(90deg, ${z.from}, ${z.to})` }} />
                    <p className="text-[9px] font-semibold text-[#b8b8b8]">{z.label}</p>
                    <p className="text-[8px] text-[#b8b8b8]/60">{Math.round(ftp * z.pct / 100)}W</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent rides ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Recent Rides</p>
            {syncing
              ? <span className="text-[10px] text-[#b8b8b8]">Syncing...</span>
              : <PoweredByStrava />}
          </div>
          {syncing && monthlyActivities.length === 0 ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl glass animate-pulse" />)}</div>
          ) : monthlyActivities.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-[#b8b8b8] text-sm">No rides for {format(now, "MMMM")}.</p>
              <button onClick={handleSync} className="mt-3 text-xs underline underline-offset-2 text-[#ff4b35]">Sync Strava</button>
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
                  <div className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#ff4b35] flex-shrink-0">
                    <Bike size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#ffffff] truncate">{activity.name}</p>
                    <p className="text-[10px] text-[#b8b8b8]">
                      {format(new Date(activity.date), "MMM d")}
                      {activity.detectedZoneId && (
                        <span className="ml-1.5 text-[#ffffff]/70">- {activity.detectedZoneId.replace(/^[a-z]+-/, "").replace(/-/g, " ")}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-[#ff4b35]">{(activity.distance / 1000).toFixed(1)} km</p>
                    <p className="text-[10px] text-[#b8b8b8]">{formatDuration(activity.movingTime)}</p>
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
          className="w-full rounded-2xl py-3 font-semibold text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-40 text-[#b8b8b8] hover:text-[#ffffff]"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing Strava..." : "Sync with Strava"}
        </button>

      </main>
      <NavBar />
    </div>
  );
}
