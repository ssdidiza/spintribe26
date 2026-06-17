"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm } from "@/lib/mock-data";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import { SperaIcon } from "@/components/SperaLogo";
import FeedbackBoard from "@/components/FeedbackBoard";
import ThemeToggle from "@/components/ThemeToggle";
import LeagueStatus from "@/components/LeagueStatus";
import { TIER_COLORS, canAccessChampionFeatures, hasAdminRole } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { LogOut, MapPin, Star, ShieldCheck, Lock, RefreshCw, Unplug, Trash2, Zap, ArrowUp, ArrowDown, Check } from "lucide-react";

type LeaguePromotion = { toName: string; toThreshold: number; fromName: string | null; kind: string };
type LeagueHistoryEntry = {
  monthKey: string;
  assignedKm: number;
  leagueName: string;
  leagueThreshold: number;
  promoted: boolean;
  relegated: boolean;
  promotions: LeaguePromotion[];
};
type LeagueApi = {
  monthKey: string;
  current: {
    monthlyKm: number;
    league: { name: string; minKm: number; maxKm: number | null };
    leagueMinKm: number;
    nextLeague: { name: string } | null;
    promotionTargetKm: number;
    remainingKm: number;
    progressPct: number;
    fastTrackedThisMonth: boolean;
    promotions: LeaguePromotion[];
    rankDistance: number | null;
    leagueRiders: number;
  };
  history: LeagueHistoryEntry[];
};

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("default", { month: "short", year: "numeric" });
}

// Build the club journey for a month, collapsing consecutive duplicates.
function journeyClubs(fallbackLeague: string, promotions: LeaguePromotion[]) {
  const clubs = promotions.length
    ? [promotions[0].fromName ?? fallbackLeague, ...promotions.map((p) => p.toName)]
    : [fallbackLeague];
  return clubs.filter((club, i) => i === 0 || club !== clubs[i - 1]);
}

export default function ProfilePage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, activities, zones, championSessions, logout, completeOnboarding } = useStore();
  const [disconnecting, setDisconnecting] = useState<"disconnect" | "delete" | null>(null);
  const [league, setLeague] = useState<LeagueApi | null>(null);
  const persistedZone = currentUser?.zone ?? currentUser?.region ?? "";
  const [zoneValue, setZoneValue] = useState(persistedZone);
  const [zoneBaseline, setZoneBaseline] = useState(persistedZone);
  const [savingZone, setSavingZone] = useState(false);
  const [zoneSaved, setZoneSaved] = useState(false);

  // Resync the editor when the persisted zone changes (hydration or after a
  // save). Adjusting state during render avoids a setState-in-effect cascade.
  if (persistedZone !== zoneBaseline) {
    setZoneBaseline(persistedZone);
    setZoneValue(persistedZone);
  }

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded) return;
    const controller = new AbortController();
    fetch("/api/leagues", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setLeague(data as LeagueApi); })
      .catch(() => {});
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded]);

  const localMonthlyKm = useMemo(
    () => (currentUser ? getMonthlyKm(currentUser.id, activities) : 0),
    [currentUser, activities]
  );

  // Known zones for the editor (seed + community zones), de-duplicated by name.
  const zoneOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; region: string }[] = [];
    for (const zone of zones) {
      const key = zone.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ name: zone.name, region: zone.region });
    }
    return list.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  }, [zones]);

  if (!hydrated || !currentUser) return null;

  const tierColor      = TIER_COLORS[currentUser.tier];
  const champSessions  = championSessions.filter((s) => s.userId === currentUser.id);
  const champingCount  = champSessions.filter((s) => s.type === "champing").length;
  const myZones        = zones.filter((z) => z.createdBy === currentUser.id);
  const isChamp        = canAccessChampionFeatures(currentUser);
  const isAdmin        = hasAdminRole(currentUser);

  const roleLabel = isAdmin ? "Admin + Champion" : isChamp ? "Champion" : "Member";
  const roleColor = isAdmin ? "var(--accent-foreground)" : isChamp ? "var(--foreground)" : "var(--muted-foreground)";

  const leagueName = league?.current.league.name ?? `${currentUser.tier} Club`;
  const monthlyKm = league?.current.monthlyKm ?? localMonthlyKm;

  // "This month" journey from live data, then earlier months from membership
  // history (current month excluded to avoid duplicate rows).
  const currentMonthKey = league?.monthKey;
  const pastHistory = (league?.history ?? [])
    .filter((h) => h.monthKey !== currentMonthKey)
    .slice()
    .reverse();
  const currentJourney = journeyClubs(leagueName, league?.current.promotions ?? []);
  const zoneDirty = (currentUser.zone ?? currentUser.region ?? "") !== zoneValue;

  async function handleLogout() {
    await Promise.allSettled([
      supabase.auth.signOut(),
      fetch("/api/auth/logout", { method: "POST" }),
    ]);
    logout();
    router.push("/");
  }

  async function handleStravaDisconnect(deleteAccount = false) {
    setDisconnecting(deleteAccount ? "delete" : "disconnect");
    try {
      await fetch("/api/strava/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAccount }),
      });
    } finally {
      logout();
      router.push("/");
    }
  }

  async function updateConsent(kind: "leaderboard" | "rewards") {
    if (!currentUser) return;
    const nextLeaderboard = kind === "leaderboard" ? !(currentUser.leaderboardConsent ?? true) : currentUser.leaderboardConsent ?? true;
    const nextRewards = kind === "rewards" ? !(currentUser.rewardsExportConsent ?? true) : currentUser.rewardsExportConsent ?? true;
    const res = await fetch("/api/users/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderboardConsent: nextLeaderboard, rewardsExportConsent: nextRewards }),
    });
    if (res.ok) {
      completeOnboarding(currentUser.role, currentUser.tier, currentUser.zone || currentUser.region, nextLeaderboard, nextRewards);
    }
  }

  async function saveZone() {
    if (!currentUser || !zoneDirty) return;
    setSavingZone(true);
    try {
      const res = await fetch("/api/users/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: zoneValue }),
      });
      if (res.ok) {
        completeOnboarding(
          currentUser.role,
          currentUser.tier,
          zoneValue,
          currentUser.leaderboardConsent ?? true,
          currentUser.rewardsExportConsent ?? true
        );
        setZoneSaved(true);
        window.setTimeout(() => setZoneSaved(false), 1500);
      }
    } finally {
      setSavingZone(false);
    }
  }

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <h1 className="font-bold text-foreground text-xl">Profile</h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-6 space-y-3">

        {/* ── Athlete card ─────────────────────────────────────────── */}
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: "linear-gradient(160deg, rgba(255,75,53,0.12) 0%, var(--fill-mid) 100%)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(255,75,53,0.22) 0%, transparent 70%)", filter: "blur(40px)" }}
          />

          <div className="relative z-10 px-6 pt-8 pb-6 flex flex-col items-center text-center gap-4">
            <div className="relative">
              {currentUser.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ border: "2px solid rgba(255,75,53,0.6)", boxShadow: "0 0 24px rgba(255,75,53,0.35)" }}
                />
              ) : (
                <div
                  className="gradient-primary w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black text-white"
                  style={{ boxShadow: "0 0 24px rgba(255,75,53,0.35)" }}
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", boxShadow: "0 0 12px rgba(255,75,53,0.55)" }}
              >
                {isAdmin ? <ShieldCheck size={14} color="#fff" /> : isChamp ? <Star size={14} color="#fff" fill="#fff" /> : <SperaIcon className="h-4 w-4" />}
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-foreground tracking-tight">{currentUser.name}</h2>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: roleColor }}>{roleLabel}</span>
                {(currentUser.zone || currentUser.region) && (
                  <>
                    <span className="text-foreground/30">-</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin size={11} />
                      {currentUser.zone || currentUser.region}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* League chip — leagues are earned, not chosen */}
            <div className="flex flex-col items-center gap-1">
              <span
                className="flex items-center gap-1.5 text-[11px] font-bold rounded-full px-4 py-1.5 tracking-wide"
                style={{ background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}40` }}
              >
                <Lock size={10} />
                {leagueName} - {monthlyKm} km this month
              </span>
              <p className="text-[9px] text-muted-foreground/40">Leagues are earned through verified Strava rides</p>
            </div>

            {isChamp && (
              <div className="w-full grid grid-cols-2 gap-2">
                {[
                  { icon: <Star size={15} />, value: champingCount, label: "Check-ins" },
                  { icon: <MapPin size={15} />, value: myZones.length, label: "Zones" },
                ].map(({ icon, value, label }) => (
                  <div key={label} className="rounded-2xl px-3 py-4 flex flex-col items-center gap-1.5" style={{ background: "var(--fill-soft)", border: "1px solid var(--border)" }}>
                    <span className="text-muted-foreground/70">{icon}</span>
                    <span className="text-2xl font-black text-foreground">{value}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {currentUser.stravaId && (
              <a
                href={`https://www.strava.com/athletes/${currentUser.stravaId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-[#FC4C02]/80 hover:text-[#FC4C02] transition-colors underline underline-offset-2"
              >
                View on Strava
              </a>
            )}
          </div>

          {currentUser.stravaId && !currentUser.ftp && (
            <div className="mx-6 mb-4 rounded-2xl px-4 py-3 text-[10px] leading-relaxed text-muted-foreground/80" style={{ background: "rgba(255,75,53,0.08)", border: "1px solid rgba(255,75,53,0.2)" }}>
              <span className="inline-flex items-center gap-1 font-bold text-accent-foreground"><Zap size={11} /> FTP not showing?</span>{" "}
              First set a value in{" "}
              <a href="https://www.strava.com/settings/performance" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-accent-foreground/80 hover:text-accent-foreground">
                Strava Settings / My Performance
              </a>
              , then tap <span className="font-semibold text-accent-foreground">Reconnect Strava</span> below to grant profile access.
            </div>
          )}

          <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <PoweredByStrava />
              {currentUser.stravaId && (
                <a href="/api/auth/strava?reauth=1" className="flex items-center gap-1 text-[10px] font-semibold text-accent-foreground/60 hover:text-accent-foreground transition-colors">
                  <RefreshCw size={11} />
                  Reconnect Strava
                </a>
              )}
            </div>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive/70 hover:text-destructive transition-colors">
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>

        {/* ── League status (one progression system) ───────────────── */}
        <LeagueStatus
          leagueName={leagueName}
          monthlyKm={monthlyKm}
          promotionTargetKm={league?.current.promotionTargetKm ?? currentUser.tier}
          remainingKm={league?.current.remainingKm ?? Math.max(0, currentUser.tier - monthlyKm)}
          progressPct={league?.current.progressPct ?? Math.min(100, Math.round((monthlyKm / Math.max(1, currentUser.tier)) * 100))}
          nextLeagueName={league?.current.nextLeague?.name ?? null}
          leagueMinKm={league?.current.leagueMinKm ?? 0}
          fastTracked={league?.current.fastTrackedThisMonth}
          rank={league?.current.rankDistance ?? null}
          leagueRiders={league?.current.leagueRiders ?? null}
          variant="card"
        />

        {/* ── League History (own journey only) ─────────────────────── */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">League Journey</p>
          </div>
          <div className="divide-y divide-foreground/[0.06]">
            <JourneyRow label="This month" clubs={currentJourney} fastTracked={league?.current.fastTrackedThisMonth} />
            {pastHistory.map((h) => (
              <JourneyRow
                key={h.monthKey}
                label={monthLabel(h.monthKey)}
                clubs={journeyClubs(h.leagueName, h.promotions)}
                promoted={h.promoted}
                relegated={h.relegated}
              />
            ))}
            {pastHistory.length === 0 && (
              <p className="px-5 py-4 text-[11px] leading-relaxed text-muted-foreground">
                Your past months will appear here as the league locks each month. Keep riding to climb the clubs.
              </p>
            )}
          </div>
        </div>

        {/* ── Home zone editor ──────────────────────────────────────── */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Home Zone</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Rides without GPS detection are credited to your home zone in the zone rankings.
            </p>
            <div className="flex gap-2">
              <select
                value={zoneValue}
                onChange={(e) => setZoneValue(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none"
              >
                <option value="">No home zone</option>
                {zoneOptions.map((zone) => (
                  <option key={zone.name} value={zone.name}>{zone.name} ({zone.region})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveZone}
                disabled={!zoneDirty || savingZone}
                className="inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-black text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#ff7a2f,#ff4b35,#e0007a)" }}
              >
                {zoneSaved ? <><Check size={13} /> Saved</> : savingZone ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        <FeedbackBoard />

        {/* ── Appearance ───────────────────────────────────────────── */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Appearance</p>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Theme</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Auto follows your device setting</p>
            </div>
            <ThemeToggle className="flex-shrink-0" />
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Sharing Preferences</p>
          </div>
          <button
            onClick={() => updateConsent("leaderboard")}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-foreground/5 transition-colors border-b border-foreground/[0.06]"
          >
            <span className="text-sm font-semibold text-foreground">Rankings sharing (league, team, zone)</span>
            <span className="text-xs font-bold text-accent-foreground">{currentUser.leaderboardConsent !== false ? "On" : "Off"}</span>
          </button>
          <button
            onClick={() => updateConsent("rewards")}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-foreground/5 transition-colors"
          >
            <span className="text-sm font-semibold text-foreground">Rewards export consent</span>
            <span className="text-xs font-bold text-accent-foreground">{currentUser.rewardsExportConsent !== false ? "On" : "Off"}</span>
          </button>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Data Controls</p>
          </div>
          <button
            onClick={() => handleStravaDisconnect(false)}
            disabled={!!disconnecting}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-foreground/5 transition-colors border-b border-foreground/[0.06] disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-foreground">
              {disconnecting === "disconnect" ? "Disconnecting..." : "Disconnect Strava and remove ride cache"}
            </span>
            <Unplug size={14} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => handleStravaDisconnect(true)}
            disabled={!!disconnecting}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-destructive">
              {disconnecting === "delete" ? "Deleting..." : "Delete account data"}
            </span>
            <Trash2 size={14} className="text-destructive" />
          </button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/50">SpinTribe - Team Vitality - 2026</p>
      </main>
      <NavBar />
    </div>
  );
}

function JourneyRow({
  label,
  clubs,
  promoted,
  relegated,
  fastTracked,
}: {
  label: string;
  clubs: string[];
  promoted?: boolean;
  relegated?: boolean;
  fastTracked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {clubs.map((club, i) => (
            <span key={`${club}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">→</span>}
              <span className="text-xs font-black text-foreground">{club}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {fastTracked && <Zap size={13} className="text-accent-foreground" />}
        {promoted && <ArrowUp size={14} className="text-emerald-500" />}
        {relegated && <ArrowDown size={14} className="text-[#ff7a2f]" />}
      </div>
    </div>
  );
}
