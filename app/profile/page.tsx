"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm } from "@/lib/mock-data";
import NavBar from "@/components/NavBar";
import ProgressRing from "@/components/ProgressRing";
import { TIER_LABELS, canAccessChampionFeatures, hasAdminRole } from "@/lib/types";
import { LogOut, ExternalLink, MapPin, Star, ShieldCheck } from "lucide-react";

export default function ProfilePage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, activities, zones, championSessions, logout } = useStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  if (!hydrated || !currentUser) return null;

  const monthlyKm    = getMonthlyKm(currentUser.id, activities);
  const pct          = Math.min(100, Math.round((monthlyKm / currentUser.tier) * 100));
  const champSessions = championSessions.filter((s) => s.userId === currentUser.id);
  const champingCount = champSessions.filter((s) => s.type === "champing").length;
  const ftpCount      = champSessions.filter((s) => s.type === "ftp_improver").length;
  const myZones       = zones.filter((z) => z.createdBy === currentUser.id);
  const isChamp       = canAccessChampionFeatures(currentUser);
  const isAdmin       = hasAdminRole(currentUser);

  function handleLogout() {
    logout();
    router.push("/");
  }

  const roleLabel = isAdmin ? "Admin" : isChamp ? "Champion" : "Member";
  const roleColor = isAdmin ? "#00e3fd" : isChamp ? "#cdbdff" : "#cac3d8";
  const RoleIcon  = isAdmin ? ShieldCheck : isChamp ? Star : null;

  return (
    <div className="min-h-screen bg-[#131313] pb-28">
      <header className="sticky top-0 z-40 glass border-b border-white/[0.08] px-5 py-4">
        <h1 className="font-bold text-[#e5e2e1] text-xl">Profile</h1>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6 space-y-4">

        {/* Avatar card */}
        <div className="glass-card p-6 flex flex-col items-center text-center gap-4">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-24 h-24 rounded-full object-cover"
              style={{
                border: "2px solid #7c4dff",
                boxShadow: "0 0 20px rgba(124,77,255,0.4)",
              }}
            />
            {/* Premium badge */}
            <div
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7c4dff, #00e3fd)" }}
            >
              {RoleIcon ? (
                <RoleIcon size={13} color="#fff" fill={isChamp && !isAdmin ? "#fff" : undefined} />
              ) : (
                <span className="text-[10px] font-black text-white">M</span>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-[#e5e2e1]">{currentUser.name}</h2>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-sm font-semibold" style={{ color: roleColor }}>{roleLabel}</span>
              {currentUser.region && (
                <>
                  <span className="text-[#cac3d8]/40">·</span>
                  <MapPin size={11} className="text-[#cac3d8]" />
                  <span className="text-sm text-[#cac3d8]">{currentUser.region}</span>
                </>
              )}
            </div>
          </div>

          {/* Tier badge */}
          <span
            className="text-[11px] font-bold rounded-full px-3 py-1.5"
            style={{
              border: "1px solid rgba(124,77,255,0.4)",
              color: "#cdbdff",
              background: "rgba(124,77,255,0.1)",
            }}
          >
            {TIER_LABELS[currentUser.tier]} · {currentUser.tier} km
          </span>

          {/* Strava badge */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#cac3d8] glass rounded-full px-3 py-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="#fc4c02">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 17.944h4.172" />
            </svg>
            Strava · ID {currentUser.stravaId}
          </div>
        </div>

        {/* Progress ring */}
        <div className="glass-card p-5 flex items-center gap-6">
          <ProgressRing pct={pct} size={100} strokeWidth={8} label={String(monthlyKm)} sublabel="km" />
          <div className="flex-1">
            <p className="font-bold text-[#e5e2e1]">
              {new Date().toLocaleString("default", { month: "long" })} Progress
            </p>
            <p className="text-sm text-[#cac3d8] mt-1">{monthlyKm} of {currentUser.tier} km</p>
            <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, #7c4dff, #00e3fd)",
                }} />
            </div>
            <p className="text-xs text-[#cac3d8] mt-1.5">{Math.max(0, currentUser.tier - monthlyKm)} km remaining</p>
          </div>
        </div>

        {/* Champion/Admin stats grid */}
        {isChamp && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Champing",     value: champingCount },
              { label: "FTP Sessions", value: ftpCount },
              { label: "Zones",        value: myZones.length },
            ].map(({ label, value }) => (
              <div key={label} className="glass-card p-4 text-center">
                <p className="text-2xl font-bold text-[#e5e2e1]">{value}</p>
                <p className="text-[10px] text-[#cac3d8] mt-0.5 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Zones created */}
        {myZones.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">My Zones</p>
            <div className="space-y-2">
              {myZones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-3 glass-card p-3">
                  <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0">
                    <MapPin size={13} style={{ color: "#cdbdff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#e5e2e1] truncate">{zone.name}</p>
                    <p className="text-[10px] text-[#cac3d8]">{zone.region} · {zone.usageCount} sessions</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Account */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">Account</p>
          </div>
          <button className="flex items-center justify-between w-full px-5 py-4 hover:bg-white/5 transition-colors border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-[#e5e2e1]">Strava Profile</span>
            <ExternalLink size={14} className="text-[#cac3d8]" />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center justify-between w-full px-5 py-4 hover:bg-red-500/10 transition-colors"
          >
            <span className="text-sm font-semibold text-[#ffb4ab]">Sign Out</span>
            <LogOut size={14} className="text-[#ffb4ab]" />
          </button>
        </div>

        <p className="text-center text-[10px] text-[#cac3d8]/40">SpinTribe26 · Team Vitality · 2026</p>
      </main>
      <NavBar />
    </div>
  );
}
