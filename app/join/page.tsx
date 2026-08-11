"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/champ-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Signup failed.");

      if (result.session?.accessToken) {
        await supabase.auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
        const sessionResponse = await fetch("/api/auth/email-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: result.session.accessToken }),
        });
        if (!sessionResponse.ok) throw new Error("Account created, but sign-in could not be completed.");
        router.replace("/rides");
        return;
      }

      setMessage("Account created. Check your email to confirm your account, then sign in.");
      setPassword("");
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="text-sm font-semibold text-white/50 hover:text-white">← SpinTribe</Link>
        <div className="mt-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Team Vitality · Free</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Join the champs.</h1>
          <p className="mt-4 leading-7 text-white/55">Join rides, check in, captain a ride and help shape the community. Coaching is completely optional.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-white/50">Name</span><input required value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-[#ff4b35]" /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-white/50">Email</span><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-[#ff4b35]" /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-white/50">Password</span><input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-[#ff4b35]" /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-white/50">Invite code</span><input required value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono tracking-widest outline-none focus:border-[#ff4b35]" /></label>

          {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-200">{message}</p>}

          <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 py-4 text-sm font-black disabled:opacity-50">
            {loading ? "Creating your account…" : "Join Team Vitality — Free"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/45">Already a champ? <Link href="/" className="text-white underline underline-offset-4">Sign in</Link></p>
      </div>
    </main>
  );
}
