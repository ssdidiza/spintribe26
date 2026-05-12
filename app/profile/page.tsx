"use client";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm } from "@/lib/mock-data";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import { TIER_LABELS, TIER_COLORS, canAccessChampionFeatures, hasAdminRole } from "@/lib/types";
import { LogOut, MapPin, Star, ShieldCheck, Zap, Target, Route } from "lucide-react";

// Bike wheel icon — SpinTribe26 custom mark
function BikeWheel({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="1.75" fill={color} stroke="none" />
      <line x1="12" y1="10.25" x2="12" y2="3.5" />
      <line x1="13.5" y1="10.5" x2="19.5" y2="7" />
      <line x1="13.5" y1="13.5" x2="19.5" y2="17" />
      <line x1="12" y1="13.75" x2="12" y2="20.5" />
      <line x1="10.5" y1="13.5" x2="4.5" y2="17" />
      <line x1="10.5" y1="10.5" x2="4.5" y2="7" />
    </svg>
  );
}

export default function ProfilePage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, activities, zones, championSessions, logout } = useStore();

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
  const roleColor = isAdmin ? "#00e3fd" : isChamp ? "#cdbdff" : "#a0a0b0";

  function handleLogout() {
    logout();
    router.push("/");
  }

  // Arc path for the progress ring
  const R  = 42;
  const cx = 52;
  const cy = 52;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#131313] mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <h1 className="font-bold text-[#e5e2e1] text-xl">Profile</h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-6 space-y-3">

        {/* ── Athlete card ─────────────────────────────────────────── */}
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: "linear-gradient(160deg, rgba(124,77,255,0.12) 0%, rgba(0,227,253,0.06) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Subtle glow behind avatar */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full"
            style={{
              background: "radial-gradient(ellipse, rgba(124,77,255,0.22) 0%, transparent 70%)",
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
                  style={{ border: "2px solid rgba(124,77,255,0.6)", boxShadow: "0 0 24px rgba(124,77,255,0.35)" }}
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black text-white"
                  style={{ background: "linear-gradient(135deg,#7c4dff,#00e3fd)", boxShadow: "0 0 24px rgba(124,77,255,0.35)" }}
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Role badge */}
              <div
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#ff6b6b,#a855f7,#00e3fd,#34d399)", boxShadow: "0 0 12px rgba(168,85,247,0.6)" }}
              >
                {isAdmin ? (
                  <ShieldCheck size={14} color="#fff" />
                ) : isChamp ? (
                  <Star size={14} color="#fff" fill="#fff" />
                ) : (
                  <BikeWheel size={14} color="#fff" />
                )}
              </div>
            </div>

            {/* Name + meta */}
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-[#e5e2e1] tracking-tight">{currentUser.name}</h2>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: roleColor }}>{roleLabel}</span>
                {currentUser.region && (
                  <>
                    <span className="text-white/30">·</span>
                    <span className="flex items-center gap-1 text-sm text-[#cac3d8]">
                      <MapPin size={11} />
                      {currentUser.region}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Tier chip */}
            <span
              className="text-[11px] font-bold rounded-full px-4 py-1.5 tracking-wide"
              style={{ background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}40` }}
            >
              {TIER_LABELS[currentUser.tier]} · {currentUser.tier} km target
            </span>

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
                    <stop offset="0%" stopColor="#7c4dff" />
                    <stop offset="100%" stopColor="#00e3fd" />
                  </linearGradient>
                </defs>
                <text x={cx} y={cy - 6} textAnchor="middle" fill="#e5e2e1" fontSize="18" fontWeight="800">{monthlyKm}</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill="#cac3d8" fontSize="10" fontWeight="600">km</text>
                <text x={cx} y={cy + 23} textAnchor="middle" fill="#cac3d8" fontSize="9" opacity="0.5">{pct}%</text>
              </svg>

              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#cac3d8] uppercase tracking-wider mb-0.5">
                    {new Date().toLocaleString("default", { month: "long" })} Progress
                  </p>
                  <p className="text-[#e5e2e1] font-bold text-sm">{monthlyKm} <span className="text-[#cac3d8] font-normal">of</span> {currentUser.tier} km</p>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg,#7c4dff,#00e3fd)", transition: "width 0.6s ease" }}
                  />
                </div>
                <p className="text-[11px] text-[#cac3d8]/60">{remaining} km to go</p>
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
                    <span className="text-[#cac3d8]/60">{icon}</span>
                    <span className="text-xl font-black text-[#e5e2e1]">{value}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#cac3d8]/50">{label}</span>
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

          {/* Card footer */}
          <div
            className="px-6 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <PoweredByStrava />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ffb4ab]/60 hover:text-[#ffb4ab] transition-colors"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-white/20 pb-2">SpinTribe26 · Team Vitality · 2026</p>
      </main>
      <NavBar />
    </div>
  );
}
