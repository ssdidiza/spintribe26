"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/SperaLogo";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";

/**
 * Free Team Vitality signup — the community front door.
 *
 * No payment, no PayFast, no Strava. Coaching is a separate, optional pillar
 * and is never mentioned as a requirement here (AGENTS.md "Two pillars").
 */

const PERKS = [
  "Ride with the club — free, always",
  "Captain a ride when you want to lead one",
  "Check in on ride day so turnout is known",
];

export default function JoinPage() {
  const router = useRouter();
  const login = useStore((s) => s.login);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const joinResponse = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });
      const joinData = (await joinResponse.json()) as { error?: string; userId?: string };
      if (!joinResponse.ok) throw new Error(joinData.error || "Could not create your account");

      // Sign straight in so joining is one action, not two.
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError || !data.session) {
        // Account exists; only the session failed. Send them to sign in.
        router.push("/?signin=1");
        return;
      }

      const sessionResponse = await fetch("/api/auth/email-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      if (!sessionResponse.ok) throw new Error("Account session could not be created.");

      login(joinData.userId ?? data.user.id, name.trim(), "", {
        role: "champion",
        onboarded: true,
        isConnected: false,
        leaderboardConsent: false,
        rewardsExportConsent: false,
      });
      router.push("/rides");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not create your account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <BrandMark iconClassName="h-9 w-9" showWordmark />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">
            Team Vitality
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-foreground">
            Join the club — free
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Group rides, captaincy, and check-ins. No payment, and no Strava account needed.
          </p>
        </header>

        <ul className="glass-card space-y-2.5 p-5">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check size={16} className="mt-0.5 shrink-0 text-accent-foreground" aria-hidden />
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        <form onSubmit={handleJoin} className="glass-card space-y-4 p-5">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Your name
            </span>
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[#ff4b35] focus:ring-2 focus:ring-[#ff4b35]/30"
              placeholder="Thandi Mokoena"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[#ff4b35] focus:ring-2 focus:ring-[#ff4b35]/30"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[#ff4b35] focus:ring-2 focus:ring-[#ff4b35]/30"
              placeholder="At least 8 characters"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Invite code
            </span>
            <input
              type="text"
              required
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm uppercase tracking-widest text-foreground outline-none placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:border-[#ff4b35] focus:ring-2 focus:ring-[#ff4b35]/30"
              placeholder="From Spera or a club member"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {loading ? "Creating your account…" : "Join Team Vitality"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/" className="font-bold text-accent-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
