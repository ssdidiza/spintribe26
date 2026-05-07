"use client";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useEffect } from "react";

export default function LandingPage() {
  const router = useRouter();
  const { currentUser, isOnboarded } = useStore();

  useEffect(() => {
    if (currentUser && isOnboarded) router.replace("/dashboard");
    else if (currentUser && !isOnboarded) router.replace("/onboarding");
  }, [currentUser, isOnboarded, router]);

  function handleConnect() {
    window.location.href = "/api/auth/strava";
  }

  return (
    <main className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Atmospheric glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-30"
        style={{ background: "radial-gradient(ellipse, #FF6500 0%, #FF2D00 50%, transparent 100%)" }}
      />

      {/* Top brand strip */}
      <div className="relative z-10 px-6 pt-10 flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary" fill="currentColor" style={{ color: "#FF6500" }}>
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 17.944h4.172" />
        </svg>
        <span className="text-xs font-semibold tracking-widest uppercase text-white/60">Team Vitality</span>
      </div>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 pb-4">
        <div className="max-w-sm">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4" style={{ color: "#FF6500" }}>
            SpinTribe 2026
          </p>
          <h1 className="text-5xl font-black leading-[1.0] tracking-tight text-white mb-6">
            PUSH<br />
            BEYOND<br />
            <span style={{ color: "#FF6500" }}>LIMITS.</span>
          </h1>
          <p className="text-white/60 text-sm leading-relaxed max-w-xs">
            Join the global community. Track your rides and climb the leaderboard in the monthly km challenge.
          </p>
        </div>

        {/* Tier pills */}
        <div className="mt-8 flex gap-2 flex-wrap">
          {[
            { km: 200, label: "Rookie", color: "#60a5fa" },
            { km: 400, label: "Contender", color: "#34d399" },
            { km: 800, label: "Elite", color: "#f97316" },
            { km: 1000, label: "Pinnacle", color: "#a78bfa" },
          ].map((t) => (
            <span
              key={t.km}
              className="rounded-full px-3 py-1 text-xs font-bold border"
              style={{ borderColor: `${t.color}40`, color: t.color, background: `${t.color}10` }}
            >
              {t.km} km · {t.label}
            </span>
          ))}
        </div>

        {/* Path cards */}
        <div className="mt-8 space-y-3">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-white/40">Choose your path</p>
          <div
            className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3 backdrop-blur-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🚴</span>
            </div>
            <div>
              <p className="font-bold text-sm text-white">I am a Team Member</p>
              <p className="text-xs text-white/50">Compete and contribute to the challenge goals</p>
            </div>
          </div>
          <div
            className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3 backdrop-blur-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🏆</span>
            </div>
            <div>
              <p className="font-bold text-sm text-white">I am a Team Champ</p>
              <p className="text-xs text-white/50">Lead your squad and manage the challenge</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA bottom */}
      <div className="relative z-10 px-6 pb-12 pt-4 max-w-sm mx-auto w-full">
        <button
          onClick={handleConnect}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl text-white font-black py-4 text-sm tracking-wide transition-all active:scale-[0.98]"
          style={{ background: "#FF6500" }}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 17.944h4.172" />
          </svg>
          CONNECT WITH STRAVA
        </button>
        <p className="mt-3 text-center text-[10px] text-white/30">
          By connecting, you agree to our Terms of Service
        </p>
      </div>
    </main>
  );
}
