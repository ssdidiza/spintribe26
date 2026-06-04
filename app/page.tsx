"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bike,
  CalendarCheck,
  Flag,
  Gauge,
  Mountain,
  Route,
  Target,
  Trophy,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import LegalFooter from "@/components/LegalFooter";
import { supabase } from "@/lib/supabase";
import { getPostLoginRoute } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

type Mode = "signin" | "signup";

type FeatureItem = {
  title: string;
  body: string;
  Icon: LucideIcon;
};

const LEADERBOARD_FEATURES: FeatureItem[] = [
  { title: "Monthly Distance Rankings", body: "See who is riding the furthest.", Icon: Route },
  { title: "Climbing Rankings", body: "Compete for elevation gained.", Icon: Mountain },
  { title: "Consistency Rankings", body: "Reward the cyclists who keep showing up.", Icon: CalendarCheck },
  { title: "Club Rankings", body: "Compare yourself against riders from your club and region.", Icon: Users },
];

const PROGRESS_FEATURES: FeatureItem[] = [
  { title: "Connect Strava", body: "Sync rides automatically in seconds.", Icon: Zap },
  { title: "Earn Your Position", body: "Every kilometre, climb, and ride contributes to your ranking.", Icon: Trophy },
  { title: "Track Your Growth", body: "See how your fitness and performance improve over time.", Icon: TrendingUp },
  { title: "Compete Year Round", body: "New challenges, leaderboards, and achievements every month.", Icon: CalendarCheck },
];

const INSIGHT_FEATURES: FeatureItem[] = [
  { title: "Race Predictions", body: "See estimated finish times for major South African cycling events.", Icon: Gauge },
  { title: "Event Preparation", body: "Know if your current training supports your target race goals.", Icon: Flag },
  { title: "Personal Insights", body: "Track distance, climbing, consistency, and progression.", Icon: BarChart3 },
  { title: "Monthly Challenges", body: "Push yourself further with community-driven goals.", Icon: Target },
];

const RIDER_TYPES: FeatureItem[] = [
  { title: "New Riders", body: "Stay motivated and build consistency.", Icon: Bike },
  { title: "Weekend Warriors", body: "Turn training into friendly competition.", Icon: Zap },
  { title: "Club Cyclists", body: "See how you stack up against your peers.", Icon: Users },
  { title: "Serious Racers", body: "Track performance and dominate the rankings.", Icon: Trophy },
];

const EVENTS = [
  "Ride Joburg",
  "Cape Town Cycle Tour",
  "Amashova",
  "99er Cycle Tour",
  "Fast One",
  "Local club races",
];

const LEADERBOARD_ROWS = [
  { rank: 1, name: "Mandla", club: "Gauteng", km: "812 km", climb: "9,420 m" },
  { rank: 2, name: "Anele", club: "Western Cape", km: "786 km", climb: "11,080 m" },
  { rank: 3, name: "Sipho", club: "KwaZulu-Natal", km: "744 km", climb: "8,190 m" },
  { rank: 4, name: "Leah", club: "Eastern Cape", km: "691 km", climb: "7,860 m" },
];

export default function LandingPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, login, completeOnboarding } = useStore();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (currentUser && isOnboarded) router.replace(getPostLoginRoute(currentUser));
    else if (currentUser && !isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.user) {
          if (!data.session) {
            setInfo("Check your email for a confirmation link, then sign in.");
            setLoading(false);
            return;
          }
          const displayName = name.trim() || email.split("@")[0];
          await fetch("/api/auth/email-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: data.session.access_token }),
          });
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
            router.push(getPostLoginRoute({ role: row.role }));
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
          await fetch("/api/auth/email-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: data.session.access_token }),
          });
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
            router.push(getPostLoginRoute({ role: row.role }));
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
    <div className="min-h-screen bg-[#020202] text-white">
      <main>
        <section className="relative overflow-hidden px-5 pb-12 pt-8 sm:px-8 lg:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(255,75,53,0.18), transparent 25rem), radial-gradient(circle at 86% 12%, rgba(224,0,122,0.16), transparent 24rem)",
            }}
          />
          <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black"
                style={{ background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)" }}
              >
                ST
              </div>
              <span className="text-xl font-black tracking-tight">SpinTribe</span>
            </div>
            <button
              onClick={handleStrava}
              className="hidden rounded-full border border-[#ff4b35]/45 px-4 py-2 text-xs font-black uppercase tracking-wide text-[#ff4b35] transition-colors hover:border-[#ff4b35] hover:text-white sm:inline-flex"
            >
              Connect Strava
            </button>
          </div>

          <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:pt-16">
            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#ff4b35]">
                South Africa&apos;s Competitive Cycling Leaderboard
              </p>
              <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Connect Strava. Ride your bike. <span className="gradient-text">Climb the rankings.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#b8b8b8] sm:text-lg">
                SpinTribe turns every ride into a challenge by ranking cyclists across distance, climbing, consistency, and monthly achievements.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/45">
                See where you stand. Track your progress. Compete with cyclists across South Africa.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  onClick={handleStrava}
                  className="flex items-center justify-center transition-all hover:opacity-90 active:scale-[0.98]"
                  aria-label="Connect with Strava"
                >
                  <Image
                    src="/strava/btn_connect_with_strava_orange.svg"
                    alt="Connect with Strava"
                    width={193}
                    height={48}
                    className="h-12 w-auto"
                    unoptimized
                    priority
                  />
                </button>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
                  No manual uploads. No spreadsheets. Just ride.
                </span>
              </div>

              <details className="mt-6 max-w-sm rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <summary className="cursor-pointer text-sm font-bold text-white/70 transition-colors hover:text-white">
                  Use email instead
                </summary>
                <div className="pt-4">
                  <div className="mb-5 flex rounded-2xl p-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {(["signin", "signup"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setMode(m);
                          setError("");
                          setInfo("");
                        }}
                        className="flex-1 rounded-xl py-2 text-sm font-bold transition-all"
                        style={mode === m
                          ? { background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", color: "#fff" }
                          : { color: "#b8b8b8" }}
                      >
                        {m === "signin" ? "Sign In" : "Sign Up"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    {mode === "signup" && (
                      <Field label="Name">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                          className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:ring-2 focus:ring-[#ff4b35]/60"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                        />
                      </Field>
                    )}

                    <Field label="Email">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:ring-2 focus:ring-[#ff4b35]/60"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                    </Field>

                    <Field label="Password">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        minLength={6}
                        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:ring-2 focus:ring-[#ff4b35]/60"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                    </Field>

                    {error && (
                      <p className="rounded-xl px-4 py-2 text-xs text-[#ffb4ab]" style={{ background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.2)" }}>
                        {error}
                      </p>
                    )}
                    {info && (
                      <p className="rounded-xl px-4 py-2 text-xs text-white" style={{ background: "rgba(255,75,53,0.1)", border: "1px solid rgba(255,75,53,0.22)" }}>
                        {info}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-2xl py-3.5 text-sm font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", boxShadow: "0 0 22px rgba(255,75,53,0.34)" }}
                    >
                      {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                  </form>
                </div>
              </details>
            </div>

            <div className="glass-card p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff4b35]">Live Monthly Board</p>
                  <p className="mt-1 text-sm text-white/45">Distance, climbing, and consistency</p>
                </div>
                <div className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold text-white/45">
                  SA
                </div>
              </div>
              <div className="space-y-3">
                {LEADERBOARD_ROWS.map((r) => (
                  <div key={r.rank} className="grid grid-cols-[2.4rem_1fr_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: r.rank === 1 ? "linear-gradient(135deg,#ff7a2f,#ff3b30)" : "rgba(255,255,255,0.08)" }}>
                      #{r.rank}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{r.name}</p>
                      <p className="truncate text-[10px] text-white/35">{r.club}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-[#ff4b35]">{r.km}</p>
                      <p className="text-[10px] text-white/35">{r.climb}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {["Distance", "Climbing", "Consistency"].map((label) => (
                  <div key={label} className="rounded-xl border border-white/8 bg-white/[0.035] p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <Section title="The Leaderboard Never Sleeps" eyebrow="Every ride counts" body="Whether you're chasing 100km weekends, climbing mountains, or building consistency during the week, SpinTribe automatically tracks your progress and updates your rankings.">
          <FeatureGrid items={LEADERBOARD_FEATURES} />
        </Section>

        <Section title="Built For Cyclists Who Love Progress">
          <FeatureGrid items={PROGRESS_FEATURES} />
        </Section>

        <Section title="More Than A Leaderboard" body="SpinTribe helps cyclists understand their riding and prepare for bigger goals.">
          <FeatureGrid items={INSIGHT_FEATURES} />
        </Section>

        <Section title="Designed For South African Cyclists" body="Whether you're training for Ride Joburg, Cape Town Cycle Tour, Amashova, the 99er, Fast One, or local club races, SpinTribe helps you stay motivated and measure progress against riders just like you.">
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((event) => (
              <span key={event} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white/70">
                {event}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Why Riders Join SpinTribe">
          <div className="grid gap-4 lg:grid-cols-3">
            {["Most cyclists already record their rides.", "Few know how they compare.", "SpinTribe turns training into competition, motivation into consistency, and data into progress."].map((line) => (
              <div key={line} className="glass-card p-5">
                <p className="text-lg font-black leading-snug text-white">{line}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-[#ff4b35]/25 bg-[#ff4b35]/10 p-5">
            <p className="text-xl font-black text-white">See your ranking. Set bigger goals. Become a stronger cyclist.</p>
          </div>
        </Section>

        <Section title="How It Works">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["1", "Create Your Account", "Get started in under a minute."],
              ["2", "Connect Strava", "Automatically import your cycling activities."],
              ["3", "Join The Leaderboards", "Compete across distance, elevation, consistency, and challenges."],
              ["4", "Keep Riding", "Watch your rankings improve with every ride."],
            ].map(([step, title, body]) => (
              <div key={step} className="glass-card p-5">
                <p className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff4b35] text-sm font-black text-white">{step}</p>
                <h3 className="text-base font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#b8b8b8]">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="For Every Type Of Cyclist">
          <FeatureGrid items={RIDER_TYPES} />
        </Section>

        <section className="px-5 py-12 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff4b35]">The Goal</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
              To become the home of cycling leaderboards in South Africa.
            </h2>
            <div className="mt-6 grid gap-3 text-sm font-bold text-white/60 sm:grid-cols-4">
              {["One platform.", "One community.", "Thousands of cyclists.", "Millions of kilometres."].map((item) => (
                <p key={item} className="rounded-2xl border border-white/8 bg-black/25 p-4">{item}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-12 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 border-t border-white/10 pt-10 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff4b35]">Ready To See Where You Rank?</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Join South African cyclists already climbing the leaderboard.</h2>
            </div>
            <button
              onClick={handleStrava}
              className="rounded-2xl px-6 py-4 text-sm font-black uppercase tracking-wide text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg,#ff7a2f,#ff3b30,#e0007a)", boxShadow: "0 0 22px rgba(255,75,53,0.34)" }}
            >
              Connect Strava & Start Competing
            </button>
          </div>
        </section>
      </main>

      <p className="mx-auto max-w-6xl px-5 pb-5 text-center text-[10px] leading-relaxed text-white/25 sm:px-8 lg:px-12">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="underline underline-offset-2 transition-colors hover:text-white/50">
          Terms &amp; Conditions
        </Link>
        {" "}and{" "}
        <Link href="/legal/privacy" className="underline underline-offset-2 transition-colors hover:text-white/50">
          Privacy Policy
        </Link>
        . Strava data is used for leaderboard progress, challenge tracking, and ride verification.
      </p>
      <LegalFooter />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#b8b8b8]">{label}</span>
      {children}
    </label>
  );
}

function Section({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 max-w-3xl">
          {eyebrow && <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-[#ff4b35]">{eyebrow}</p>}
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
          {body && <p className="mt-3 text-base leading-relaxed text-[#b8b8b8]">{body}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function FeatureGrid({ items }: { items: FeatureItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ title, body, Icon }) => (
        <div key={title} className="glass-card p-5">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff4b35]/15 text-[#ff4b35]">
            <Icon size={18} />
          </div>
          <h3 className="text-base font-black text-white">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[#b8b8b8]">{body}</p>
        </div>
      ))}
    </div>
  );
}
