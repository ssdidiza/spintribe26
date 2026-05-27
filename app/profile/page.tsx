"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm } from "@/lib/mock-data";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import { SperaIcon } from "@/components/SperaLogo";
import { TIER_LABELS, TIER_COLORS, canAccessChampionFeatures, hasAdminRole } from "@/lib/types";
import { LogOut, MapPin, Star, ShieldCheck, Zap, Target, Route, Lock, RefreshCw, Unplug, Trash2 } from "lucide-react";

export default function ProfilePage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, activities, zones, championSessions, logout } = useStore();
  const [disconnecting, setDisconnecting] = useState<"disconnect" | "delete" | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  const monthlyKm = useMemo(
    () => (currentUser ? getMonthlyKm(currentUser.id, activities) : 0),
    [currentUser, activities]
  );

  if (!hydrated || !currentUser) return null;

  const pct           = Math.min(100, Math.round((monthlyKm / currentUser.tier) * 100));
  const remaining     = Math.max(0, currentUser.tier - monthlyKm);
  const tierColor     = TIER_COLORS[currentUser.tier];
  const champSessions = championSessions.filter((s) => s.userId === currentUser.id);
  const champingCount = champSessions.filter((s) => s.type === "champing").length;
  const ftpCount      = champSessions.filter((s) => s.type === "ftp_improver").length;
  const myZones       = zones.filter((z) => z.createdBy === currentUser.id);
  const isChamp       = canAccessChampionFeatures(currentUser);
  const isAdmin       = hasAdminRole(currentUser);

  const roleLabel = isAdmin ? "Admin" : isChamp ? "Champion" : "Member";
  const roleColor = isAdmin ? "#ff4b35" : isChamp ? "#ffffff" : "#a0a0a0";

  function handleLogout() {
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

  // Arc path for the progress ring
  const R  = 42;
  const cx = 52;
  const cy = 52;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#020202] mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <h1 className="font-bold text-[#ffffff] text-xl">Profile</h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-6 space-y-3">

        {/* ── Athlete card ─────────────────────────────────────────── */}
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: "linear-gradient(160deg, rgba(255,75,53,0.12) 0%, rgba(255,255,255,0.06) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Subtle glow behind avatar */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full"
            style={{
              background: "radial-gradient(ellipse, rgba(255,75,53,0.22) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />

          <div className="relative z-10 px-6 pt-8 pb-6 flex flex-col items-center text-center gap-4">

            {/* Avatar */}
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
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black text-white"
                  style={{ background: "linear-gradient(135deg,#ff4b35,#ffffff)", boxShadow: "0 0 24px rgba(255,75,53,0.35)" }}
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Role badge */}
              <div
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", boxShadow: "0 0 12px rgba(255,75,53,0.55)" }}
              >
                {isAdmin ? (
                  <ShieldCheck size={14} color="#fff" />
                ) : isChamp ? (
                  <Star size={14} color="#fff" fill="#fff" />
                ) : (
                  <SperaIcon className="h-4 w-4" />
                )}
              </div>
            </div>

            {/* Name + meta */}
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-[#ffffff] tracking-tight">{currentUser.name}</h2>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: roleColor }}>{roleLabel}</span>
                {currentUser.region && (
                  <>
                    <span className="text-white/30">·</span>
                    <span className="flex items-center gap-1 text-sm text-[#b8b8b8]">
                      <MapPin size={11} />
                      {currentUser.region}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Tier chip — locked for champions */}
            <div className="flex flex-col items-center gap-1">
              <span
                className="flex items-center gap-1.5 text-[11px] font-bold rounded-full px-4 py-1.5 tracking-wide"
                style={{ background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}40` }}
              >
                <Lock size={10} />
                {TIER_LABELS[currentUser.tier]} · {currentUser.tier} km target
              </span>
              {isChamp && (
                <p className="text-[9px] text-[#b8b8b8]/40">
                  Distance locked — disconnect account to change tier
                </p>
              )}
            </div>

            {/* ── Progress ring + stats ────────────────────────────── */}
            <div
              className="w-full rounded-2xl px-5 py-5 flex items-center gap-6"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {/* SVG ring */}
              <svg width={104} height={104} viewBox="0 0 104 104" className="flex-shrink-0">
                <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle
                  cx={cx} cy={cy} r={R}
                  fill="none"
                  stroke="url(#ringGrad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
                <defs>
                  <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff4b35" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
                <text x={cx} y={cy - 6} textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="800">{monthlyKm}</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill="#b8b8b8" fontSize="10" fontWeight="600">km</text>
                <text x={cx} y={cy + 23} textAnchor="middle" fill="#b8b8b8" fontSize="9" opacity="0.5">{pct}%</text>
              </svg>

              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#b8b8b8] uppercase tracking-wider mb-0.5">
                    {new Date().toLocaleString("default", { month: "long" })} Progress
                  </p>
                  <p className="text-[#ffffff] font-bold text-sm">{monthlyKm} <span className="text-[#b8b8b8] font-normal">of</span> {currentUser.tier} km</p>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ff4b35,#ffffff)", transition: "width 0.6s ease" }}
                  />
                </div>
                <p className="text-[11px] text-[#b8b8b8]/60">{remaining} km to go</p>
              </div>
            </div>

            {/* Champion stats (if applicable) */}
            {isChamp && (
              <div className="w-full grid grid-cols-3 gap-2">
                {[
                  { icon: <Target size={15} />, value: champingCount, label: "Champing" },
                  { icon: <Zap size={15} />,    value: ftpCount,      label: "FTP Rides" },
                  { icon: <Route size={15} />,  value: myZones.length, label: "Zones" },
                ].map(({ icon, value, label }) => (
                  <div
                    key={label}
                    className="rounded-2xl px-3 py-3 flex flex-col items-center gap-1"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <span className="text-[#b8b8b8]/60">{icon}</span>
                    <span className="text-xl font-black text-[#ffffff]">{value}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#b8b8b8]/50">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Strava link — required by Strava guidelines */}
            {currentUser.stravaId && (
              <a
                href={`https://www.strava.com/athletes/${currentUser.stravaId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-[#FC4C02]/80 hover:text-[#FC4C02] transition-colors underline underline-offset-2"
              >
                View Strava Profile ↗
              </a>
            )}
          </div>

          {/* FTP tip */}
          {currentUser.stravaId && !currentUser.ftp && (
            <div
              className="mx-6 mb-4 rounded-2xl px-4 py-3 text-[10px] leading-relaxed text-[#b8b8b8]/70"
              style={{ background: "rgba(255,75,53,0.08)", border: "1px solid rgba(255,75,53,0.2)" }}
            >
              <span className="font-bold text-[#ff4b35]">⚡ FTP not showing?</span>{" "}
              First set a value in{" "}
              <a
                href="https://www.strava.com/settings/performance"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-[#ff4b35]/80 hover:text-[#ff4b35]"
              >
                Strava → Settings → My Performance
              </a>
              , then tap <span className="font-semibold text-[#ff4b35]">Reconnect Strava</span> below to grant profile access.
            </div>
          )}

          {/* Card footer */}
          <div
            className="px-6 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-3">
              <PoweredByStrava />
              {currentUser.stravaId && (
                <a
                  href="/api/auth/strava?reauth=1"
                  className="flex items-center gap-1 text-[10px] font-semibold text-[#ff4b35]/50 hover:text-[#ff4b35] transition-colors"
                >
                  <RefreshCw size={11} />
                  Reconnect Strava
                </a>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ffb4ab]/60 hover:text-[#ffb4ab] transition-colors"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Data Controls</p>
          </div>
          <button
            onClick={() => handleStravaDisconnect(false)}
            disabled={!!disconnecting}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-white/5 transition-colors border-b border-white/[0.06] disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-[#ffffff]">
              {disconnecting === "disconnect" ? "Disconnecting..." : "Disconnect Strava and remove ride cache"}
            </span>
            <Unplug size={14} className="text-[#b8b8b8]" />
          </button>
          <button
            onClick={() => handleStravaDisconnect(true)}
            disabled={!!disconnecting}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-[#ffb4ab]">
              {disconnecting === "delete" ? "Deleting..." : "Delete account data"}
            </span>
            <Trash2 size={14} className="text-[#ffb4ab]" />
          </button>
        </div>

        <p className="text-center text-[10px] text-[#b8b8b8]/40">spera · Team Vitality · 2026</p>
      </main>
      <NavBar />
    </div>
  );
}
