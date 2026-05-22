"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/useHydrated";
import Image from "next/image";
import LegalFooter from "@/components/LegalFooter";

type Mode = "signin" | "signup";

export default function LandingPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, login, completeOnboarding } = useStore();

  const [mode, setMode]         = useState<Mode>("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [info, setInfo]         = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (currentUser && isOnboarded) router.replace("/dashboard");
    else if (currentUser && !isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.user) {
          // Check if email confirmation is required
          if (!data.session) {
            setInfo("Check your email for a confirmation link, then sign in.");
            setLoading(false); return;
          }
          const displayName = name.trim() || email.split("@")[0];
          // Set server-side session
          await fetch("/api/auth/email-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: data.session.access_token }),
          });
          // Check if user already onboarded in DB
          const { data: row } = await supabase
            .from("users")
            .select("name, role, tier, zone, onboarded")
            .eq("strava_id", data.user.id)
            .maybeSingle();
          if (row?.onboarded) {
            login(data.user.id, row.name || displayName, "");
            completeOnboarding(row.role, row.tier, row.zone);
            router.push("/dashboard");
          } else {
            login(data.user.id, displayName);
            router.push("/onboarding");
          }
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        if (data.user) {
          const displayName = name.trim() || email.split("@")[0];
          // Set server-side session
          await fetch("/api/auth/email-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: data.session.access_token }),
          });
          // Fetch display name and onboarding status from Supabase users table
          const { data: row } = await supabase
            .from("users")
            .select("name, role, tier, zone, onboarded")
            .eq("strava_id", data.user.id)
            .maybeSingle();
          if (row?.onboarded) {
            login(data.user.id, row.name || displayName, "");
            completeOnboarding(row.role, row.tier, row.zone);
            router.push("/dashboard");
          } else {
            login(data.user.id, row?.name || displayName);
            router.push("/onboarding");
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
    }
    setLoading(false);
  }

  function handleStrava() {
    window.location.href = "/api/auth/strava";
  }

  if (!hydrated) return null;

  return (
    <div className="min-h-screen bg-[#131313] flex flex-col">
    <main className="flex-1 flex flex-col md:flex-row overflow-hidden">

      {/* ── Left panel — hero ─────────────────────────────────────── */}
      <div className="relative flex flex-col justify-between px-8 pt-12 pb-8 md:w-1/2 md:min-h-screen">
        {/* Atmospheric glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(ellipse, rgba(124,77,255,0.2) 0%, transparent 70%)",
            filter: "blur(80px)",
            zIndex: 0,
          }}
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#1a0a2e,#0a1a2e)" }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" strokeWidth="1.5" strokeLinecap="round">
              <defs>
                <linearGradient id="iridLanding" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stopColor="#ff6b6b" />
                  <stop offset="33%"  stopColor="#a855f7" />
                  <stop offset="66%"  stopColor="#00e3fd" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <circle cx="12" cy="12" r="9.5" stroke="url(#iridLanding)" />
              <circle cx="12" cy="12" r="1.75" fill="url(#iridLanding)" stroke="none" />
              <line x1="12" y1="10.25" x2="12" y2="3.5" stroke="url(#iridLanding)" />
              <line x1="13.5" y1="10.5" x2="19.5" y2="7" stroke="url(#iridLanding)" />
              <line x1="13.5" y1="13.5" x2="19.5" y2="17" stroke="url(#iridLanding)" />
              <line x1="12" y1="13.75" x2="12" y2="20.5" stroke="url(#iridLanding)" />
              <line x1="10.5" y1="13.5" x2="4.5" y2="17" stroke="url(#iridLanding)" />
              <line x1="10.5" y1="10.5" x2="4.5" y2="7" stroke="url(#iridLanding)" />
            </svg>
          </div>
          <span className="text-xs font-bold tracking-widest uppercase text-white/60">SpinTribe 2026</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 py-12 md:py-0 md:flex-1 md:flex md:flex-col md:justify-center">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4"
            style={{ color: "#cdbdff" }}>Team Vitality Challenge</p>
          <h1 className="text-5xl md:text-6xl font-black leading-[1.0] tracking-tight text-white mb-5">
            PUSH<br />BEYOND<br />
            <span className="gradient-text">LIMITS.</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs mb-8">
            Track your rides, climb the leaderboard, and unlock AI-powered training insights in the monthly km challenge.
          </p>

          {/* Tier pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { km: 200,  label: "Rookie",    color: "#60a5fa" },
              { km: 400,  label: "Contender", color: "#34d399" },
              { km: 800,  label: "Elite",     color: "#f97316" },
              { km: 1000, label: "Pinnacle",  color: "#a78bfa" },
            ].map((t) => (
              <span key={t.km} className="rounded-full px-3 py-1 text-xs font-bold border"
                style={{ borderColor: `${t.color}40`, color: t.color, background: `${t.color}10` }}>
                {t.km} km · {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* Features row (desktop only) */}
        <div className="relative z-10 hidden md:flex gap-4 mt-8">
          {["🚴 Strava Sync", "🏆 Leaderboard", "🤖 AI Insights", "⚡ FTP Zones"].map((f) => (
            <span key={f} className="text-[11px] text-white/40 font-medium">{f}</span>
          ))}
        </div>
      </div>

      {/* ── Right panel — auth form ────────────────────────────────── */}
      <div className="flex flex-col justify-center px-8 pb-12 md:pb-0 md:w-1/2 md:min-h-screen">
        <div className="w-full max-w-sm mx-auto">

          {/* Mode toggle */}
          <div className="flex rounded-2xl p-1 mb-8"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); setInfo(""); }}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={mode === m
                  ? { background: "linear-gradient(135deg,#7c4dff,#00e3fd)", color: "#fff" }
                  : { color: "#cac3d8" }}>
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-[#cac3d8] uppercase tracking-wider mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#7c4dff]/60 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#cac3d8] uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#7c4dff]/60 transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#cac3d8] uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#7c4dff]/60 transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            {error && (
              <p className="text-xs text-[#ffb4ab] rounded-xl px-4 py-2"
                style={{ background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.2)" }}>
                {error}
              </p>
            )}
            {info && (
              <p className="text-xs text-[#bdf4ff] rounded-xl px-4 py-2"
                style={{ background: "rgba(0,227,253,0.08)", border: "1px solid rgba(0,227,253,0.2)" }}>
                {info}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-sm tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#7c4dff,#00e3fd)", boxShadow: "0 0 20px rgba(124,77,255,0.35)" }}>
              {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <span className="text-xs text-white/30 font-medium">or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Official "Connect with Strava" button per Strava branding guidelines */}
          <button
            onClick={handleStrava}
            className="w-full flex items-center justify-center transition-all active:scale-[0.98] hover:opacity-90"
            aria-label="Connect with Strava"
          >
            <Image
              src="/strava/btn_connect_with_strava_orange.svg"
              alt="Connect with Strava"
              width={193}
              height={48}
              className="h-12 w-auto"
              unoptimized
            />
          </button>

          {/* Dot floor — Gemini-style atmospheric effect at the bottom of the auth panel */}
          <div aria-hidden className="dot-floor w-full h-16 mt-4" />

          <p className="mt-2 text-center text-[10px] text-white/25 leading-relaxed">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline underline-offset-2 hover:text-white/50 transition-colors">
              Terms &amp; Conditions
            </Link>
            {" "}and{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-white/50 transition-colors">
              Privacy Policy
            </Link>
            .{" "}Strava integration is currently invite-only — use email to join.
          </p>
        </div>
      </div>

    </main>
    <LegalFooter />
    </div>
  );
}
