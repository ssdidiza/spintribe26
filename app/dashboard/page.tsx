"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm, buildLeaderboard, getFeaturedZone } from "@/lib/mock-data";
import { TIER_LABELS } from "@/lib/types";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import NotificationBanner from "@/components/NotificationBanner";
import { RefreshCw, Zap, Clock, Bike, TrendingUp, MapPin, Trophy } from "lucide-react";
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
    currentUser, isOnboarded, activities, zones, users,
    syncStravaActivities, hydrateChampionSessions, hydrateAthleteData, hydrateActivities,
  } = useStore();
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await syncStravaActivities();
    setSyncing(false);
  }, [syncStravaActivities]);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    Promise.all([hydrateChampionSessions(), hydrateAthleteData(), hydrateActivities()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentUser, isOnboarded]);

  const userActivities = useMemo(
    () => activities
      .filter((a) => a.userId === currentUser?.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [activities, currentUser?.id]
  );

  const monthlyKm   = useMemo(
    () => currentUser ? getMonthlyKm(currentUser.id, activities) : 0,
    [currentUser, activities]
  );
  const realUsers   = useMemo(() => users.filter((u) => u.isConnected), [users]);
  const leaderboardEntries = useMemo(
    () => currentUser ? buildLeaderboard(currentUser.tier, realUsers, activities) : [],
    [currentUser, realUsers, activities]
  );
  const topRiders = useMemo(() => leaderboardEntries.slice(0, 3), [leaderboardEntries]);
  const currentRankEntry = useMemo(
    () => leaderboardEntries.find((entry) => entry.user.id === currentUser?.id),
    [leaderboardEntries, currentUser?.id]
  );
  const featuredZone = useMemo(() => getFeaturedZone(activities, zones), [activities, zones]);

  if (!hydrated || !currentUser) return null;

  const targetKm    = currentUser.tier;
  const pct         = Math.min(100, Math.round((monthlyKm / targetKm) * 100));
  const remainingKm = Math.max(0, targetKm - monthlyKm);
  const totalMoving = userActivities.reduce((s, a) => s + a.movingTime, 0);
  const avgKm       = userActivities.length
    ? Math.round(userActivities.reduce((s, a) => s + a.distance, 0) / 1000 / userActivities.length)
    : 0;

  const ftp = currentUser.ftp;
  const now = new Date();

  // â”€â”€ Progress pace calculations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth   = now.getDate();
  const daysLeft     = daysInMonth - dayOfMonth;
  const expectedKmByNow = (targetKm / daysInMonth) * dayOfMonth;
  const paceKmPerDay    = dayOfMonth > 0 ? monthlyKm / dayOfMonth : 0;
  const projectedTotal  = Math.round(paceKmPerDay * daysInMonth);
  const kmNeededPerDay  = daysLeft > 0 ? Math.ceil(remainingKm / daysLeft) : 0;
  const paceRatio       = expectedKmByNow > 0 ? monthlyKm / expectedKmByNow : (monthlyKm > 0 ? 2 : 0);

  type ProgressStatus = "complete" | "great" | "on_track" | "behind";
  const progressStatus: ProgressStatus =
    pct >= 100           ? "complete" :
    paceRatio >= 1.1     ? "great"    :
    paceRatio >= 0.82    ? "on_track" :
                           "behind";

  const STATUS_CONFIG: Record<ProgressStatus, { label: string; emoji: string; color: string; bg: string; border: string }> = {
    complete: { label: "Challenge Complete!",  emoji: "ðŸŽ‰", color: "#ff4b35", bg: "rgba(255,75,53,0.12)", border: "rgba(255,75,53,0.35)" },
    great:    { label: "Doing Great",          emoji: "ðŸ”¥", color: "#ffffff", bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.22)" },
    on_track: { label: "On Track",             emoji: "âœ…", color: "#ffffff", bg: "rgba(255,255,255,0.08)",  border: "rgba(255,255,255,0.25)"  },
    behind:   { label: "Falling Behind",       emoji: "âš ï¸", color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)" },
  };
  const statusCfg = STATUS_CONFIG[progressStatus];

  const STATS = [
    { label: "Rides",  value: userActivities.length,                              icon: <Bike       size={14} className="text-[#ff4b35]" /> },
    { label: "Avg km", value: avgKm,                                               icon: <TrendingUp size={14} className="text-[#ffffff]" /> },
    { label: "Time",   value: formatDuration(totalMoving),                         icon: <Clock      size={14} className="text-[#ffb1c1]" /> },
    { label: "Rank",   value: currentRankEntry ? `#${currentRankEntry.rank}` : "-", icon: <Trophy     size={14} className="text-[#ff4b35]" /> },
  ];

  return (
    <div className="min-h-screen bg-[#020202] mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">
            {format(now, "MMMM yyyy")}
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
            <span style={{ color: "#1ED760", fontSize: 9 }}>▶</span>
            <span className="text-[9px] font-semibold tracking-wide" style={{ color: "#1ED760" }}>Now Playing</span>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold rounded-full px-2.5 py-1 border border-[#ff4b35]/40"
            style={{ color: "#ff4b35", background: "rgba(255,75,53,0.1)" }}>
            {TIER_LABELS[currentUser.tier]} Â· {currentUser.tier} km
          </span>
          <button onClick={handleSync} disabled={syncing}
            className="w-8 h-8 rounded-full glass flex items-center justify-center text-[#b8b8b8] disabled:opacity-40 hover:text-[#ff4b35] transition-colors">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-6 space-y-5">

        <NotificationBanner />

        {/* â”€â”€ Cinematic hero â€” monthly km â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="relative text-center pt-6 pb-2">
          <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#b8b8b8]/50 mb-4">
            {format(now, "MMMM yyyy")} Â· {TIER_LABELS[currentUser.tier]}
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
          <p className="text-sm text-[#b8b8b8]/50 mb-5">
            Rank {currentRankEntry ? `#${currentRankEntry.rank}` : "-"} of {leaderboardEntries.length || 1}
            {" "}in {TIER_LABELS[currentUser.tier]} &nbsp;·&nbsp; {pct}% of {targetKm} km
          </p>
          {/* Slim progress bar */}
          <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[240px] mx-auto mb-1">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #ff4b35, #ffffff)", boxShadow: "0 0 6px rgba(255,255,255,0.5)" }} />
          </div>
          {/* Challenge complete banner */}
          {pct >= 100 && (
            <div className="mt-5 rounded-2xl p-3 text-center text-sm font-bold max-w-xs mx-auto"
              style={{ background: "rgba(255,75,53,0.15)", color: "#ff4b35", border: "1px solid rgba(255,75,53,0.25)" }}>
              ðŸŽ‰ Challenge complete â€” {targetKm} km done!
            </div>
          )}
        </div>

        {/* â”€â”€ Progress tracking card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div
          className="glass-card p-5"
          style={{ borderColor: statusCfg.border, background: statusCfg.bg }}
        >
          {/* Status row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{statusCfg.emoji}</span>
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
              {/* Dual-marker progress bar */}
              <div className="relative h-2 rounded-full bg-white/[0.06] overflow-visible mb-4">
                {/* Expected-by-now marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full opacity-50"
                  style={{ left: `${Math.min(100, (expectedKmByNow / targetKm) * 100)}%`, background: "#b8b8b8" }}
                />
                {/* Actual progress fill */}
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${statusCfg.color}99, ${statusCfg.color})`, boxShadow: `0 0 8px ${statusCfg.color}66` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[#b8b8b8]/60 -mt-3 mb-4">
                <span>0</span>
                <span style={{ marginLeft: `${Math.min(80, (expectedKmByNow / targetKm) * 100 - 2)}%` }}>
                  expected
                </span>
                <span>{targetKm} km</span>
              </div>

              {/* 3-stat row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black" style={{ color: statusCfg.color }}>
                    {paceRatio > 0 ? `${Math.round(paceRatio * 100)}%` : "â€”"}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8] mt-0.5">of pace</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black text-[#ffffff]">{kmNeededPerDay}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8] mt-0.5">km/day needed</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black text-[#ffffff]">{projectedTotal}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8] mt-0.5">km projected</p>
                </div>
              </div>

              {/* Narrative line */}
              <p className="text-[11px] text-[#b8b8b8]/70 mt-3 leading-snug">
                {progressStatus === "behind"
                  ? `You need ${kmNeededPerDay} km/day for the remaining ${daysLeft} day${daysLeft !== 1 ? "s" : ""} to hit ${targetKm} km.`
                  : progressStatus === "great"
                  ? `At your current pace you'll finish around ${projectedTotal} km â€” ${projectedTotal - targetKm} km over target.`
                  : `You're right on pace. Keep riding ${kmNeededPerDay} km/day to secure your ${targetKm} km goal.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-[#b8b8b8] leading-relaxed">
              You&apos;ve hit your {targetKm} km target with {daysLeft} day{daysLeft !== 1 ? "s" : ""} to spare. Keep riding â€” every km now is a bonus.
            </p>
          )}
        </div>

          {/* FTP card */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Fitness Benchmarks</p>

            {ftp ? (
              <>
                <div>
                  <p className="text-[10px] text-[#b8b8b8] uppercase tracking-wider mb-1">FTP Â· Functional Threshold Power</p>
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
              </>
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center gap-2">
                <Zap size={28} className="text-[#ff4b35]/40" />
                <p className="text-sm font-semibold text-[#b8b8b8]">FTP not set</p>
                <p className="text-[10px] text-[#b8b8b8]/60 leading-snug max-w-[220px]">
                  <span className="font-semibold text-[#b8b8b8]/80">Step 1 â€”</span>{" "}
                  Set an FTP value in{" "}
                  <a
                    href="https://www.strava.com/settings/performance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 text-[#ff4b35]/70 hover:text-[#ff4b35]"
                  >
                    Strava â†’ My Performance
                  </a>
                  .{" "}
                  <span className="font-semibold text-[#b8b8b8]/80">Step 2 â€”</span>{" "}
                  Go to your{" "}
                  <a href="/profile" className="underline underline-offset-2 text-[#ff4b35]/70 hover:text-[#ff4b35]">
                    Profile
                  </a>{" "}
                  and tap <span className="font-semibold">Reconnect Strava</span>.
                </p>
              </div>
            )}

          </div>

        {/* 4-stat bento */}
        <div className="grid grid-cols-4 gap-2">
          {STATS.map(({ label, value, icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1">{icon}</div>
              <p className="text-lg font-bold text-[#ffffff]">{value}</p>
              <p className="text-[9px] text-[#b8b8b8] mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Sync button */}
        <button onClick={handleSync} disabled={syncing}
          className="w-full rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #ff4b35 0%, #ffffff 100%)", boxShadow: "0 0 20px rgba(255,75,53,0.4)", color: "#fff" }}>
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing Stravaâ€¦" : "Sync with Strava"}
        </button>
{/* Leaders + Featured zone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {topRiders.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8] mb-3">
                {TIER_LABELS[currentUser.tier]} Leaders
              </p>
              <div className="space-y-2">
                {topRiders.map((entry, i) => {
                  const medals = ["ðŸ¥‡", "ðŸ¥ˆ", "ðŸ¥‰"];
                  const isMe = entry.user.id === currentUser.id;
                  return (
                    <div key={entry.user.id} className="flex items-center gap-3 glass-card p-3"
                      style={isMe ? { borderColor: "rgba(255,75,53,0.4)", background: "rgba(255,75,53,0.05)" } : {}}>
                      <span className="text-lg w-6 text-center">{medals[i]}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.user.avatar} alt={entry.user.name}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        style={isMe ? { border: "2px solid #ff4b35" } : {}} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#ffffff] truncate">{entry.user.name.split(" ")[0]}</p>
                        <div className="mt-1 h-1 rounded-full overflow-hidden bg-white/10">
                          <div className="h-full rounded-full"
                            style={{ width: `${entry.progressPct}%`, background: "linear-gradient(90deg,#ff4b35,#ffffff)" }} />
                        </div>
                      </div>
                      <p className="text-sm font-bold text-[#ff4b35] flex-shrink-0">{entry.totalKm} km</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {featuredZone && (
            <section>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8] mb-3">Most Active Zone</p>
              <div className="glass-card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
                    <MapPin size={16} style={{ color: "#ffffff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#ffffff]">{featuredZone.name}</p>
                    <p className="text-[10px] text-[#b8b8b8]">{featuredZone.region}</p>
                    <p className="text-[10px] text-[#b8b8b8]/60 mt-1 leading-snug">{featuredZone.description}</p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-[10px] font-semibold text-[#ffffff]">{featuredZone.usageCount} sessions</span>
                      <span className="text-[10px] text-[#b8b8b8]">{featuredZone.type}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Recent rides */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Recent Rides</p>
            {syncing
              ? <span className="text-[10px] text-[#b8b8b8]">Syncingâ€¦</span>
              : <PoweredByStrava />}
          </div>
          {syncing && userActivities.length === 0 ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-2xl glass animate-pulse" />)}</div>
          ) : userActivities.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-[#b8b8b8] text-sm">No rides for {format(now, "MMMM")}.</p>
              <button onClick={handleSync} className="mt-3 text-xs underline underline-offset-2 text-[#ff4b35]">Sync Strava</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {userActivities.slice(0, 8).map((activity) => (
                <a
                  key={activity.id}
                  href={`https://www.strava.com/activities/${activity.stravaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 glass-card p-3 hover:border-[#FC4C02]/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl glass flex items-center justify-center text-base flex-shrink-0">
                    {activity.type === "VirtualRide" ? "ðŸ " : activity.type === "Run" ? "ðŸƒ" : "ðŸš´"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#ffffff] truncate">{activity.name}</p>
                    <p className="text-[10px] text-[#b8b8b8]">
                      {format(new Date(activity.date), "MMM d")}
                      {activity.detectedZoneId && (
                        <span className="ml-1.5 text-[#ffffff]/70">Â· {activity.detectedZoneId.replace(/^[a-z]+-/, "").replace(/-/g, " ")}</span>
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
      </main>
      <NavBar />
    </div>
  );
}

