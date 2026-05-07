"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm, buildLeaderboard } from "@/lib/mock-data";
import { TIER_LABELS } from "@/lib/types";
import NavBar from "@/components/NavBar";
import ProgressRing from "@/components/ProgressRing";
import { RefreshCw, Zap, Clock, Bike, TrendingUp } from "lucide-react";
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
    syncStravaActivities, hydrateChampionSessions,
  } = useStore();
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    // Hydrate champion sessions from Supabase on mount
    hydrateChampionSessions();
    const myActivities = activities.filter((a) => a.userId === currentUser.id);
    if (myActivities.length === 0) handleSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentUser, isOnboarded]);

  async function handleSync() {
    setSyncing(true);
    await syncStravaActivities();
    setSyncing(false);
  }

  if (!hydrated || !currentUser) return null;

  const userActivities = activities
    .filter((a) => a.userId === currentUser.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const monthlyKm    = getMonthlyKm(currentUser.id, activities);
  const targetKm     = currentUser.tier;
  const pct          = Math.min(100, Math.round((monthlyKm / targetKm) * 100));
  const remainingKm  = Math.max(0, targetKm - monthlyKm);
  const totalMoving  = userActivities.reduce((s, a) => s + a.movingTime, 0);
  const avgKm        = userActivities.length
    ? Math.round(userActivities.reduce((s, a) => s + a.distance, 0) / 1000 / userActivities.length)
    : 0;

  const realUsers    = users.filter((u) => u.isConnected);
  const topRiders    = buildLeaderboard(currentUser.tier, realUsers, activities).slice(0, 3);

  const userRegion   = currentUser.region ?? "Gauteng";
  const featuredZone = zones
    .filter((z) => z.region === userRegion || z.region === "National")
    .sort((a, b) => b.usageCount - a.usageCount)[0];

  const now = new Date();

  const STATS = [
    { label: "Rides",    value: userActivities.length, icon: <Bike size={14} className="text-[#cdbdff]" /> },
    { label: "Avg km",   value: avgKm,                 icon: <TrendingUp size={14} className="text-[#00e3fd]" /> },
    { label: "Time",     value: formatDuration(totalMoving), icon: <Clock size={14} className="text-[#ffb1c1]" /> },
    { label: "Kudos",    value: userActivities.reduce((s, a) => s + a.kudos, 0), icon: <Zap size={14} className="text-[#cdbdff]" /> },
  ];

  return (
    <div className="min-h-screen bg-[#131313] pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-white/[0.08] px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
            {format(now, "MMMM yyyy")}
          </p>
          <h1 className="font-bold text-[#e5e2e1] text-base leading-tight truncate max-w-[200px]">
            {currentUser.name.split(/[\s"]/)[0]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold rounded-full px-2.5 py-1 border border-[#7c4dff]/40"
            style={{ color: "#cdbdff", background: "rgba(124,77,255,0.1)" }}
          >
            {TIER_LABELS[currentUser.tier]} · {currentUser.tier} km
          </span>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-8 h-8 rounded-full glass flex items-center justify-center text-[#cac3d8] disabled:opacity-40 hover:text-[#cdbdff] transition-colors"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6 space-y-5">

        {/* Progress ring hero */}
        <div className="glass-card p-6">
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-4">
            Monthly Progress
          </p>
          <div className="flex items-center gap-6">
            <ProgressRing pct={pct} size={130} strokeWidth={10} label={`${monthlyKm}`} sublabel="km" />
            <div className="flex-1 space-y-4">
              <StatLine label="Target"    value={`${targetKm} km`}           accent />
              <StatLine label="Remaining" value={`${remainingKm} km`} />
              <StatLine label="Tier"      value={TIER_LABELS[currentUser.tier]} />
            </div>
          </div>
          {pct >= 100 && (
            <div className="mt-4 rounded-2xl p-3 text-center text-sm font-bold"
              style={{ background: "rgba(124,77,255,0.15)", color: "#cdbdff" }}>
              🎉 Challenge complete — {targetKm} km done!
            </div>
          )}
        </div>

        {/* 4-stat bento grid */}
        <div className="grid grid-cols-4 gap-2">
          {STATS.map(({ label, value, icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1">{icon}</div>
              <p className="text-lg font-bold text-[#e5e2e1]">{value}</p>
              <p className="text-[9px] text-[#cac3d8] mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Sync CTA */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #7c4dff 0%, #00e3fd 100%)",
            boxShadow: "0 0 20px rgba(124,77,255,0.4)",
            color: "#fff",
          }}
        >
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing Strava…" : "Sync with Strava"}
        </button>

        {/* Top riders preview */}
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
                  <div
                    key={entry.user.id}
                    className="flex items-center gap-3 glass-card p-3"
                    style={isMe ? { borderColor: "rgba(124,77,255,0.4)", background: "rgba(124,77,255,0.05)" } : {}}
                  >
                    <span className="text-lg w-6 text-center">{medals[i]}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.user.avatar} alt={entry.user.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      style={isMe ? { border: "2px solid #7c4dff" } : {}} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#e5e2e1] truncate">{entry.user.name.split(" ")[0]}</p>
                      <div className="mt-1 h-1 rounded-full overflow-hidden bg-white/10">
                        <div className="h-full rounded-full transition-all"
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

        {/* Featured zone */}
        {featuredZone && (
          <div className="glass-card overflow-hidden">
            <div className="p-4">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-1">
                Featured Zone
              </p>
              <p className="font-bold text-[#e5e2e1] text-base">{featuredZone.name}</p>
              <p className="text-[#cac3d8] text-xs mt-1 leading-snug">{featuredZone.description}</p>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[10px] text-[#cac3d8]">{featuredZone.region}</span>
                <span className="text-[10px] font-semibold text-[#00e3fd]">{featuredZone.usageCount} sessions</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent rides */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">Recent Rides</p>
            <span className="text-[10px] text-[#cac3d8]">{syncing ? "Syncing…" : "Strava"}</span>
          </div>
          {syncing && userActivities.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl glass animate-pulse" />
              ))}
            </div>
          ) : userActivities.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-[#cac3d8] text-sm">No rides for {format(now, "MMMM")}.</p>
              <button onClick={handleSync} className="mt-3 text-xs underline underline-offset-2 text-[#cdbdff]">
                Sync Strava
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {userActivities.slice(0, 8).map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 glass-card p-3">
                  <div className="w-9 h-9 rounded-xl glass flex items-center justify-center text-base flex-shrink-0">
                    {activity.type === "VirtualRide" ? "🏠" : activity.type === "Run" ? "🏃" : "🚴"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#e5e2e1] truncate">{activity.name}</p>
                    <p className="text-[10px] text-[#cac3d8]">{format(new Date(activity.date), "MMM d")}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-[#cdbdff]">{(activity.distance / 1000).toFixed(1)} km</p>
                    <p className="text-[10px] text-[#cac3d8]">{formatDuration(activity.movingTime)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <NavBar />
    </div>
  );
}

function StatLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-[#cac3d8] uppercase tracking-wider">{label}</p>
      <p className="font-bold text-sm" style={accent ? { color: "#cdbdff" } : { color: "#e5e2e1" }}>{value}</p>
    </div>
  );
}
