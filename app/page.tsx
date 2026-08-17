"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, CreditCard, Loader2, X } from "lucide-react";
import { BrandMark } from "@/components/SperaLogo";
import { supabase } from "@/lib/supabase";
import { getPostLoginRoute, type UserRole } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

const SESSION_OPTIONS = [
  { id: "confidence", name: "Beginner confidence ride", description: "Build skills and confidence on the road.", duration: "60 min", price: "R399" },
  { id: "performance", name: "Performance ride", description: "Focused coaching for stronger, smarter riding.", duration: "90 min", price: "R549" },
  { id: "block", name: "Performance block", description: "Four coached rides with a clear progression.", duration: "4 × 90 min", price: "R1,899" },
] as const;

export default function LandingPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, login, completeOnboarding } = useStore();
  const [selectedSession, setSelectedSession] = useState("confidence");
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (currentUser?.isConnected && isOnboarded) router.replace(getPostLoginRoute(currentUser));
    else if (currentUser?.isConnected && !isOnboarded) router.replace("/onboarding");
    else if (currentUser && !currentUser.isConnected) router.replace(currentUser.role === "champion" ? "/rides" : "/lessons");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!showSignIn) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowSignIn(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showSignIn]);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (!data.user || !data.session) throw new Error("Sign in could not be completed.");

      const sessionResponse = await fetch("/api/auth/email-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      const sessionData = await sessionResponse.json() as {
        athleteId?: string | null;
        profileId?: string | null;
        platformRole?: string;
        clubChampion?: boolean;
        error?: string;
      };
      if (!sessionResponse.ok) throw new Error(sessionData.error || "Account session could not be created.");

      const displayName = email.split("@")[0];
      const profileId = sessionData.profileId ?? sessionData.athleteId ?? data.user.id;
      const isStravaConnected = Boolean(sessionData.athleteId);
      const { data: row } = await supabase
        .from("users")
        .select("name, role, tier, team_id, current_league_id, current_league_name, current_league_threshold, zone, onboarded, ftp, country, leaderboard_consent, rewards_export_consent")
        .eq("strava_id", profileId)
        .maybeSingle();

      // users.role is platform-wide only. The client keeps the historical
      // "champion" UI role as a derived capability so existing champ screens
      // remain compatible while team_memberships is the server authority.
      const derivedRole: UserRole = row?.role === "admin"
        ? "admin"
        : sessionData.clubChampion
          ? "champion"
          : "member";

      if (!isStravaConnected) {
        login(profileId, row?.name || displayName, "", {
          role: derivedRole,
          tier: row?.tier ?? 200,
          onboarded: true,
          isConnected: false,
          leaderboardConsent: row?.leaderboard_consent ?? false,
          rewardsExportConsent: row?.rewards_export_consent ?? false,
        });
        completeOnboarding(derivedRole, row?.tier ?? 200, row?.zone ?? undefined, row?.leaderboard_consent ?? false, row?.rewards_export_consent ?? false);
        router.push(derivedRole === "champion" ? "/rides" : derivedRole === "admin" ? "/admin" : "/lessons");
      } else if (row?.onboarded) {
        login(profileId, row.name || displayName, "", {
          role: derivedRole,
          tier: row.tier,
          teamId: row.team_id ?? undefined,
          currentLeagueId: row.current_league_id ?? undefined,
          currentLeagueName: row.current_league_name ?? undefined,
          currentLeagueThreshold: row.current_league_threshold ?? undefined,
          zone: row.zone,
          region: row.zone,
          onboarded: row.onboarded,
          leaderboardConsent: row.leaderboard_consent !== false,
          rewardsExportConsent: row.rewards_export_consent !== false,
          ftp: row.ftp ?? undefined,
          country: row.country ?? undefined,
          isConnected: true,
        });
        completeOnboarding(derivedRole, row.tier, row.zone, row.leaderboard_consent !== false, row.rewards_export_consent !== false);
        router.push(getPostLoginRoute({ role: derivedRole }));
      } else {
        login(profileId, row?.name || displayName, "", { isConnected: true });
        router.push("/onboarding");
      }
    } catch (signInError: unknown) {
      setError(signInError instanceof Error ? signInError.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) return null;

  return (
    <main className="min-h-screen overflow-hidden bg-[#030303] text-white">
      <section className="mx-auto flex min-h-[calc(100vh-132px)] w-full max-w-[1536px] flex-col px-6 pb-0 pt-7 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between py-2">
          <BrandMark iconClassName="h-9 w-9" showWordmark wordmarkClassName="text-xl font-black tracking-[-0.04em] text-white sm:text-2xl" />
          <div className="flex items-center gap-5">
            <Link href="/join" className="text-sm font-bold text-white/75 hover:text-white sm:text-base">Team Vitality community</Link>
            <button type="button" onClick={() => setShowSignIn(true)} className="border-b border-[#ff4b35] pb-1 text-sm font-semibold text-white transition-colors hover:text-[#ff6a50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4b35] focus-visible:ring-offset-4 focus-visible:ring-offset-black sm:text-base">Sign in</button>
          </div>
        </header>

        <div className="grid min-w-0 flex-1 items-center gap-12 pb-8 pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16 lg:pt-10">
          <div className="min-w-0 max-w-[650px] pb-2">
            <h1 className="text-[clamp(2.75rem,13vw,5.45rem)] font-black leading-[0.98] tracking-[-0.065em]">Coaching built around your <span className="gradient-text">next ride.</span></h1>
            <p className="mt-7 max-w-[560px] text-base leading-8 text-white/65 sm:text-lg">Book a single session or a focused coaching block. Pay once. Get calendar invites and email reminders.</p>
            <div className="mt-10"><p className="text-sm text-white/55">Sessions from</p><p className="mt-1 flex items-end gap-3"><span className="gradient-text text-5xl font-black tracking-[-0.05em] sm:text-6xl">R399</span><span className="pb-2 text-sm text-white/55">/ 60 min</span></p></div>
            <Link href={`/book?session=${selectedSession}`} className="mt-8 inline-flex min-h-14 w-full max-w-[410px] items-center justify-center rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-7 text-base font-black text-white shadow-[0_16px_50px_rgba(238,0,117,0.18)] transition-transform hover:-translate-y-0.5">Choose your session</Link>
            <Link href="/join" className="mt-4 inline-flex text-sm font-bold text-white/60 underline underline-offset-4 hover:text-white">Or join the Team Vitality community free →</Link>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#111] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <div className="p-5 sm:p-7 lg:p-8"><p className="mb-5 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Choose your session</p><div className="space-y-3" role="radiogroup" aria-label="Coaching session">{SESSION_OPTIONS.map((session) => { const active = selectedSession === session.id; return <button key={session.id} type="button" role="radio" aria-checked={active} onClick={() => setSelectedSession(session.id)} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-4 text-left transition-colors sm:gap-5 sm:p-5 ${active ? "border-[#ff4b35] bg-white/[0.07]" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full border ${active ? "border-[#ff5b1f]" : "border-white/30"}`}>{active && <span className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-[#ff5b1f] to-[#ee0075]" />}</span><span className="min-w-0"><span className="block text-sm font-bold text-white sm:text-base">{session.name}</span><span className="mt-1 block text-xs leading-5 text-white/50 sm:text-sm">{session.description}</span></span><span className="border-l border-white/15 pl-4 text-right sm:min-w-28 sm:pl-6"><span className="block text-xs text-white/55 sm:text-sm">{session.duration}</span><span className="mt-1 block text-base font-black text-white sm:text-lg">{session.price}</span></span></button>; })}</div></div>
            <div className="relative aspect-[16/6.2] min-h-[220px] overflow-hidden border-t border-white/10"><Image src="/coaching-hero.png" alt="A SpinTribe cycling coach riding alongside a client in Johannesburg" fill priority sizes="(max-width: 1024px) 100vw, 58vw" className="object-cover object-[50%_48%]" /><div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#111] to-transparent" /></div>
          </div>
        </div>
      </section>

      <section aria-label="How booking works" className="border-t border-white/10 bg-black/95"><div className="mx-auto max-w-[1536px] px-6 py-7 sm:px-10 lg:px-16"><div className="grid gap-0 md:grid-cols-3"><ProofItem Icon={CalendarDays} title="Pick a session" body="Choose what suits your goals." /><ProofItem Icon={CreditCard} title="Pay once" body="Secure online checkout." /><ProofItem Icon={Check} title="Get reminded" body="Calendar and email reminders included." /></div><p className="mx-auto mt-6 max-w-2xl border-t border-white/10 pt-5 text-center text-xs leading-5 text-white/40 sm:text-sm">Coaching is a paid SpinTribe service. Community club rides stay free. Official Team Vitality membership, rewards and eligibility remain governed by Discovery.</p></div></section>

      {showSignIn && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSignIn(false); }}><section role="dialog" aria-modal="true" aria-labelledby="sign-in-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Welcome back</p><h2 id="sign-in-title" className="mt-2 text-2xl font-black tracking-tight">Sign in to SpinTribe</h2></div><button type="button" onClick={() => setShowSignIn(false)} aria-label="Close sign in" className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/5 hover:text-white"><X size={20} /></button></div><form onSubmit={handleSignIn} className="mt-7 space-y-5"><label className="block"><span className="text-xs font-bold uppercase tracking-wider text-white/50">Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-[#ff4b35]" /></label><label className="block"><span className="text-xs font-bold uppercase tracking-wider text-white/50">Password</span><input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-[#ff4b35]" /></label>{error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}<button type="submit" disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white disabled:opacity-50">{loading && <Loader2 size={16} className="animate-spin" />}{loading ? "Signing in…" : "Sign in"}</button></form></section></div>}
    </main>
  );
}

function ProofItem({ Icon, title, body }: { Icon: typeof CalendarDays; title: string; body: string }) {
  return <div className="border-b border-white/10 py-4 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0"><div className="flex items-center gap-3"><Icon size={18} className="text-white/50" /><p className="text-sm font-bold">{title}</p></div><p className="mt-1 text-xs text-white/45">{body}</p></div>;
}
