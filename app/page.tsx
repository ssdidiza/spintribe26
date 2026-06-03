"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/useHydrated";
import Image from "next/image";
import LegalFooter from "@/components/LegalFooter";
import { SperaWordmark } from "@/components/SperaLogo";

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
            .select("name, role, tier, zone, onboarded, ftp, country, leaderboard_consent, rewards_export_consent")
            .eq("strava_id", data.user.id)
            .maybeSingle();
          if (row?.onboarded) {
            login(data.user.id, row.name || displayName, "", {
              role: row.role,
              tier: row.tier,
              zone: row.zone,
              region: row.zone,
              onboarded: row.onboarded,
              leaderboardConsent: row.leaderboard_consent ?? false,
              rewardsExportConsent: row.rewards_export_consent ?? false,
              ftp: row.ftp ?? undefined,
              country: row.country ?? undefined,
            });
            completeOnboarding(row.role, row.tier, row.zone, row.leaderboard_consent ?? false, row.rewards_export_consent ?? false);
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
            .select("name, role, tier, zone, onboarded, ftp, country, leaderboard_consent, rewards_export_consent")
            .eq("strava_id", data.user.id)
            .maybeSingle();
          if (row?.onboarded) {
            login(data.user.id, row.name || displayName, "", {
              role: row.role,
              tier: row.tier,
              zone: row.zone,
              region: row.zone,
              onboarded: row.onboarded,
              leaderboardConsent: row.leaderboard_consent ?? false,
              rewardsExportConsent: row.rewards_export_consent ?? false,
              ftp: row.ftp ?? undefined,
              country: row.country ?? undefined,
            });
            completeOnboarding(row.role, row.tier, row.zone, row.leaderboard_consent ?? false, row.rewards_export_consent ?? false);
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
    <div className="min-h-screen bg-[#020202] flex flex-col">
    <main className="flex-1 flex flex-col md:flex-row overflow-hidden">

      {/* ── Left panel — hero ─────────────────────────────────────── */}
      <div className="relative flex flex-col justify-between px-8 pt-12 pb-8 md:w-1/2 md:min-h-screen">
        {/* Atmospheric glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(ellipse, rgba(255,59,48,0.18) 0%, transparent 70%)",
            filter: "blur(82px)",
            zIndex: 0,
          }}
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center">
          <SperaWordmark className="h-12 w-auto" />
        </div>

        {/* Hero copy */}
        <div className="relative z-10 py-12 md:py-0 md:flex-1 md:flex md:flex-col md:justify-center">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4"
            style={{ color: "#ff4b35" }}>Team Vitality Challenge</p>
          <h1 className="text-5xl md:text-6xl font-black leading-[1.0] tracking-tight text-white mb-5">
            PUSH<br />BEYOND<br />
            <span className="gradient-text">LIMITS.</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs mb-8">
            Team Vitality Cycling Club riders sync Strava rides for monthly distance goals, tier leaderboards, and champ check-ins.
          </p>

          {/* Tier pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { km: 200,  label: "Beginner",       color: "#b8b8b8" },
              { km: 400,  label: "Intermediate",   color: "#ffffff" },
              { km: 600,  label: "Intermediate 2", color: "#ffb1c1" },
              { km: 800,  label: "Advanced",       color: "#ff7a2f" },
              { km: 1000, label: "Unicorn",        color: "#ff4b35" },
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
          {["Strava Sync", "Leaderboard", "Champ Check-ins", "FTP Zones"].map((f) => (
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
                  ? { background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", color: "#fff" }
                  : { color: "#b8b8b8" }}>
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-[#b8b8b8] uppercase tracking-wider mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#ff4b35]/60 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#b8b8b8] uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#ff4b35]/60 transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#b8b8b8] uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#ff4b35]/60 transition-all"
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
              <p className="text-xs text-white rounded-xl px-4 py-2"
                style={{ background: "rgba(255,75,53,0.1)", border: "1px solid rgba(255,75,53,0.22)" }}>
                {info}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-sm tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", boxShadow: "0 0 22px rgba(255,75,53,0.34)" }}>
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
            .{" "}Strava data is used only for club challenge progress and champ ride verification.
          </p>
        </div>
      </div>

    </main>
    <LegalFooter />
    </div>
  );
}
