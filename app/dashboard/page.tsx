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
import { RefreshCw, Zap, Clock, Bike, TrendingUp, MapPin, Sparkles } from "lucide-react";
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<{ title: string; tip: string }[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    Promise.all([hydrateChampionSessions(), hydrateAthleteData(), hydrateActivities()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentUser, isOnboarded]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await syncStravaActivities();
    setSyncing(false);
  }, [syncStravaActivities]);

  const fetchInsights = useCallback(async () => {
    setAiLoading(true);
    try {
      const userActivities = activities.filter((a) => a.userId === currentUser!.id);
      const monthlyKm      = getMonthlyKm(currentUser!.id, activities);
      const rides          = userActivities.length;
      const avgKm          = rides ? Math.round(userActivities.reduce((s, a) => s + a.distance, 0) / 1000 / rides) : 0;
      const featuredZone   = getFeaturedZone(activities, zones);
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ftp:       currentUser!.ftp,
          monthlyKm,
          targetKm:  currentUser!.tier,
          rides,
          avgKm,
          zoneName:  featuredZone?.name,
        }),
      });
      if (res.ok) {
        const { insights } = await res.json();
        setAiInsights(insights ?? []);
      }
    } catch (e) {
      console.warn("AI insights failed:", e);
    }
    setAiLoading(false);
  }, [activities, currentUser, zones]);

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
  const topRiders   = useMemo(
    () => currentUser ? buildLeaderboard(currentUser.tier, realUsers, activities).slice(0, 3) : [],
    [currentUser, realUsers, activities]
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

  // ── Progress pace calculations ────────────────────────────────────────────
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
    complete: { label: "Challenge Complete!",  emoji: "🎉", color: "#cdbdff", bg: "rgba(124,77,255,0.12)", border: "rgba(124,77,255,0.35)" },
    great:    { label: "Doing Great",          emoji: "🔥", color: "#34d399", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)" },
    on_track: { label: "On Track",             emoji: "✅", color: "#00e3fd", bg: "rgba(0,227,253,0.08)",  border: "rgba(0,227,253,0.25)"  },
    behind:   { label: "Falling Behind",       emoji: "⚠️", color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)" },
  };
  const statusCfg = STATUS_CONFIG[progressStatus];

  const STATS = [
    { label: "Rides",  value: userActivities.length,                              icon: <Bike       size={14} className="text-[#cdbdff]" /> },
    { label: "Avg km", value: avgKm,                                               icon: <TrendingUp size={14} className="text-[#00e3fd]" /> },
    { label: "Time",   value: formatDuration(totalMoving),                         icon: <Clock      size={14} className="text-[#ffb1c1]" /> },
    { label: "Kudos",  value: userActivities.reduce((s, a) => s + a.kudos, 0),    icon: <Zap        size={14} className="text-[#cdbdff]" /> },
  ];

  return (
    <div className="min-h-screen bg-[#131313] mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
            {format(now, "MMMM yyyy")}
          </p>
          <h1 className="font-bold text-[#e5e2e1] text-base leading-tight truncate max-w-[200px]">
            {currentUser.name.split(/[\s"]/)[0]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold rounded-full px-2.5 py-1 border border-[#7c4dff]/40"
            style={{ color: "#cdbdff", background: "rgba(124,77,255,0.1)" }}>
            {TIER_LABELS[currentUser.tier]} · {currentUser.tier} km
          </span>
          <button onClick={handleSync} disabled={syncing}
            className="w-8 h-8 rounded-full glass flex items-center justify-center text-[#cac3d8] disabled:opacity-40 hover:text-[#cdbdff] transition-colors">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-6 space-y-5">

        <NotificationBanner />

        {/* ── Cinematic hero — monthly km ───────────────────────────────────── */}
        <div className="relative text-center pt-6 pb-2">
          <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#cac3d8]/50 mb-4">
            {format(now, "MMMM yyyy")} · {TIER_LABELS[currentUser.tier]}
          </p>
          <div className="flex items-end justify-center gap-2 mb-1">
            <span
              className="font-black leading-none"
              style={{
                fontSize: "clamp(5rem, 22vw, 7.5rem)",
                color: "#e5e2e1",
                letterSpacing: "-0.04em",
                textShadow: "0 0 60px rgba(124,77,255,0.25)",
              }}
            >
              {monthlyKm}
            </span>
            <span className="text-2xl font-light text-[#cac3d8]/70 pb-3">km</span>
          </div>
          <p className="text-sm text-[#cac3d8]/50 mb-5">
            of {targetKm} km &nbsp;·&nbsp; {pct}% complete
          </p>
          {/* Slim progress bar */}
          <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[240px] mx-auto mb-1">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #7c4dff, #00e3fd)", boxShadow: "0 0 6px rgba(0,227,253,0.5)" }} />
          </div>
          {/* Challenge complete banner */}
          {pct >= 100 && (
            <div className="mt-5 rounded-2xl p-3 text-center text-sm font-bold max-w-xs mx-auto"
              style={{ background: "rgba(124,77,255,0.15)", color: "#cdbdff", border: "1px solid rgba(124,77,255,0.25)" }}>
              🎉 Challenge complete — {targetKm} km done!
            </div>
          )}
        </div>

        {/* ── Progress tracking card ────────────────────────────────────────── */}
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
            <span className="text-[10px] font-semibold text-[#cac3d8]">
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
                  style={{ left: `${Math.min(100, (expectedKmByNow / targetKm) * 100)}%`, background: "#cac3d8" }}
                />
                {/* Actual progress fill */}
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${statusCfg.color}99, ${statusCfg.color})`, boxShadow: `0 0 8px ${statusCfg.color}66` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[#cac3d8]/60 -mt-3 mb-4">
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
                    {paceRatio > 0 ? `${Math.round(paceRatio * 100)}%` : "—"}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-[#cac3d8] mt-0.5">of pace</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black text-[#e5e2e1]">{kmNeededPerDay}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[#cac3d8] mt-0.5">km/day needed</p>
                </div>
                <div className="text-center rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-lg font-black text-[#e5e2e1]">{projectedTotal}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[#cac3d8] mt-0.5">km projected</p>
                </div>
              </div>

              {/* Narrative line */}
              <p className="text-[11px] text-[#cac3d8]/70 mt-3 leading-snug">
                {progressStatus === "behind"
                  ? `You need ${kmNeededPerDay} km/day for the remaining ${daysLeft} day${daysLeft !== 1 ? "s" : ""} to hit ${targetKm} km.`
                  : progressStatus === "great"
                  ? `At your current pace you'll finish around ${projectedTotal} km — ${projectedTotal - targetKm} km over target.`
                  : `You're right on pace. Keep riding ${kmNeededPerDay} km/day to secure your ${targetKm} km goal.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-[#cac3d8] leading-relaxed">
              You've hit your {targetKm} km target with {daysLeft} day{daysLeft !== 1 ? "s" : ""} to spare. Keep riding — every km now is a bonus.
            </p>
          )}
        </div>

          {/* FTP card */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">Fitness Benchmarks</p>

            {ftp ? (
              <>
                <div>
                  <p className="text-[10px] text-[#cac3d8] uppercase tracking-wider mb-1">FTP · Functional Threshold Power</p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-black" style={{ color: "#cdbdff" }}>{ftp}</span>
                    <span className="text-sm text-[#cac3d8] mb-1">watts</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-[#cac3d8] uppercase tracking-wider mb-2">Power Zones</p>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { label: "Z1", pct: 55,  from: "#00e3fd44", to: "#00e3fd66" },
                      { label: "Z2", pct: 75,  from: "#00e3fd66", to: "#7c4dff66" },
                      { label: "Z3", pct: 90,  from: "#7c4dff66", to: "#7c4dff99" },
                      { label: "Z4", pct: 105, from: "#7c4dffaa", to: "#da1e67aa" },
                      { label: "Z5", pct: 120, from: "#da1e6799", to: "#da1e67cc" },
                    ].map((z) => (
                      <div key={z.label} className="text-center">
                        <div className="h-2 rounded-full mb-1"
                          style={{ background: `linear-gradient(90deg, ${z.from}, ${z.to})` }} />
                        <p className="text-[9px] font-semibold text-[#cac3d8]">{z.label}</p>
                        <p className="text-[8px] text-[#cac3d8]/60">{Math.round(ftp * z.pct / 100)}W</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center gap-2">
                <Zap size={28} className="text-[#cdbdff]/40" />
                <p className="text-sm font-semibold text-[#cac3d8]">FTP not set</p>
                <p className="text-[10px] text-[#cac3d8]/60 leading-snug max-w-[220px]">
                  <span className="font-semibold text-[#cac3d8]/80">Step 1 —</span>{" "}
                  Set an FTP value in{" "}
                  <a
                    href="https://www.strava.com/settings/performance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 text-[#cdbdff]/70 hover:text-[#cdbdff]"
                  >
                    Strava → My Performance
                  </a>
                  .{" "}
                  <span className="font-semibold text-[#cac3d8]/80">Step 2 —</span>{" "}
                  Go to your{" "}
                  <a href="/profile" className="underline underline-offset-2 text-[#cdbdff]/70 hover:text-[#cdbdff]">
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
              <p className="text-lg font-bold text-[#e5e2e1]">{value}</p>
              <p className="text-[9px] text-[#cac3d8] mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Sync button */}
        <button onClick={handleSync} disabled={syncing}
          className="w-full rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7c4dff 0%, #00e3fd 100%)", boxShadow: "0 0 20px rgba(124,77,255,0.4)", color: "#fff" }}>
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing Strava…" : "Sync with Strava"}
        </button>

        {/* AI Training Insights */}
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} style={{ color: "#cdbdff" }} />
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
                AI Training Insights
              </p>
            </div>
            <button
              onClick={fetchInsights}
              disabled={aiLoading}
              className="text-[11px] font-bold rounded-full px-3 py-1 transition-all disabled:opacity-40"
              style={{ background: "rgba(124,77,255,0.15)", color: "#cdbdff", border: "1px solid rgba(124,77,255,0.3)" }}
            >
              {aiLoading ? "Thinking…" : aiInsights.length ? "Refresh" : "Generate"}
            </button>
          </div>

          {aiInsights.length > 0 ? (
            <div className="space-y-3">
              {aiInsights.map((ins, i) => (
                <div key={i} className="flex gap-3 rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-black"
                    style={{ background: "linear-gradient(135deg,#7c4dff,#00e3fd)", color: "#fff" }}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#e5e2e1] mb-0.5">{ins.title}</p>
                    <p className="text-xs text-[#cac3d8] leading-snug">{ins.tip}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-[#cac3d8]/60">
                {aiLoading
                  ? "Analysing your training data…"
                  : "Tap Generate for personalised training tips based on your FTP and rides."}
              </p>
            </div>
          )}
        </section>

        {/* Leaders + Featured zone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {topRiders.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">
                {TIER_LABELS[currentUser.tier]} Leaders
              </p>
              <div className="space-y-2">
                {topRiders.map((entry, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const isMe = entry.user.id === currentUser.id;
                  return (
                    <div key={entry.user.id} className="flex items-center gap-3 glass-card p-3"
                      style={isMe ? { borderColor: "rgba(124,77,255,0.4)", background: "rgba(124,77,255,0.05)" } : {}}>
                      <span className="text-lg w-6 text-center">{medals[i]}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.user.avatar} alt={entry.user.name}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        style={isMe ? { border: "2px solid #7c4dff" } : {}} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#e5e2e1] truncate">{entry.user.name.split(" ")[0]}</p>
                        <div className="mt-1 h-1 rounded-full overflow-hidden bg-white/10">
                          <div className="h-full rounded-full"
                            style={{ width: `${entry.progressPct}%`, background: "linear-gradient(90deg,#7c4dff,#00e3fd)" }} />
                        </div>
                      </div>
                      <p className="text-sm font-bold text-[#cdbdff] flex-shrink-0">{entry.totalKm} km</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {featuredZone && (
            <section>
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">Most Active Zone</p>
              <div className="glass-card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(0,227,253,0.1)", border: "1px solid rgba(0,227,253,0.2)" }}>
                    <MapPin size={16} style={{ color: "#00e3fd" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#e5e2e1]">{featuredZone.name}</p>
                    <p className="text-[10px] text-[#cac3d8]">{featuredZone.region}</p>
                    <p className="text-[10px] text-[#cac3d8]/60 mt-1 leading-snug">{featuredZone.description}</p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-[10px] font-semibold text-[#00e3fd]">{featuredZone.usageCount} sessions</span>
                      <span className="text-[10px] text-[#cac3d8]">{featuredZone.type}</span>
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
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">Recent Rides</p>
            {syncing
              ? <span className="text-[10px] text-[#cac3d8]">Syncing…</span>
              : <PoweredByStrava />}
          </div>
          {syncing && userActivities.length === 0 ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-2xl glass animate-pulse" />)}</div>
          ) : userActivities.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-[#cac3d8] text-sm">No rides for {format(now, "MMMM")}.</p>
              <button onClick={handleSync} className="mt-3 text-xs underline underline-offset-2 text-[#cdbdff]">Sync Strava</button>
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
                    {activity.type === "VirtualRide" ? "🏠" : activity.type === "Run" ? "🏃" : "🚴"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#e5e2e1] truncate">{activity.name}</p>
                    <p className="text-[10px] text-[#cac3d8]">
                      {format(new Date(activity.date), "MMM d")}
                      {activity.detectedZoneId && (
                        <span className="ml-1.5 text-[#00e3fd]/70">· {activity.detectedZoneId.replace(/^[a-z]+-/, "").replace(/-/g, " ")}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-[#cdbdff]">{(activity.distance / 1000).toFixed(1)} km</p>
                    <p className="text-[10px] text-[#cac3d8]">{formatDuration(activity.movingTime)}</p>
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

