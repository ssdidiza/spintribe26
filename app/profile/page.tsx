"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  LogOut,
  ShieldCheck,
  Trash2,
  Unplug,
  User,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import ThemeToggle from "@/components/ThemeToggle";
import LegalFooter from "@/components/LegalFooter";
import { BrandMark } from "@/components/SperaLogo";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

export default function ProfilePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const currentUser = useStore((state) => state.currentUser);
  const isOnboarded = useStore((state) => state.isOnboarded);
  const logout = useStore((state) => state.logout);
  const [working, setWorking] = useState<"disconnect" | "delete" | "logout" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [currentUser, hydrated, isOnboarded, router]);

  async function handleLogout() {
    setWorking("logout");
    await Promise.allSettled([
      supabase.auth.signOut(),
      fetch("/api/auth/logout", { method: "POST" }),
    ]);
    logout();
    router.push("/");
  }

  async function handleStravaDisconnect(deleteAccount: boolean) {
    const confirmed = window.confirm(
      deleteAccount
        ? "Delete your SpinTribe account and remove all cached Strava data? This cannot be undone."
        : "Disconnect Strava and remove cached ride data from SpinTribe?"
    );
    if (!confirmed) return;

    setWorking(deleteAccount ? "delete" : "disconnect");
    setError("");
    try {
      const response = await fetch("/api/strava/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAccount }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to update your Strava connection");
      logout();
      router.push("/");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Unable to update your account");
      setWorking(null);
    }
  }

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <BrandMark showWordmark iconClassName="h-8 w-8" />
          <p className="text-sm font-black text-foreground">Profile</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-7">
        <section className="glass-card flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#ff4b35]/10 text-accent-foreground">
            {currentUser.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <User size={24} />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-tight text-foreground">{currentUser.name}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentUser.isConnected ? "Strava-connected account" : "Booking account"}
            </p>
          </div>
        </section>

        <section className="glass-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Private progress
              </p>
              <h2 className="mt-1 text-lg font-black text-foreground">
                {currentUser.isConnected ? "Strava is connected" : "Strava is optional"}
              </h2>
            </div>
            {currentUser.isConnected && <PoweredByStrava />}
          </div>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {currentUser.isConnected
              ? "Your synced rides power only your private monthly progress view."
              : "Connect Strava only if you want automatic monthly progress. Booking works without it."}
          </p>

          {currentUser.isConnected ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Link
                href="/progress"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff4b35] px-4 text-xs font-black text-white"
              >
                View progress <ArrowRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => handleStravaDisconnect(false)}
                disabled={working !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-foreground/10 px-4 text-xs font-black text-muted-foreground disabled:opacity-50"
              >
                <Unplug size={14} /> {working === "disconnect" ? "Disconnecting…" : "Disconnect Strava"}
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/strava"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FC4C02] px-4 text-xs font-black text-white sm:w-auto sm:min-w-48"
            >
              Connect Strava <ArrowRight size={14} />
            </a>
          )}
        </section>

        <section className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Appearance</p>
            <p className="mt-1 text-sm text-muted-foreground">Use your device setting or choose a theme.</p>
          </div>
          <ThemeToggle />
        </section>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        )}

        <section className="glass-card p-5">
          <p className="flex items-center gap-2 text-sm font-black text-foreground">
            <ShieldCheck size={16} className="text-accent-foreground" /> Account
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={working !== null}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-foreground/10 px-4 text-xs font-black text-foreground disabled:opacity-50"
          >
            <LogOut size={14} /> {working === "logout" ? "Signing out…" : "Sign out"}
          </button>

          {currentUser.isConnected && (
            <button
              type="button"
              onClick={() => handleStravaDisconnect(true)}
              disabled={working !== null}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-red-600 disabled:opacity-50 dark:text-red-300"
            >
              <Trash2 size={14} /> {working === "delete" ? "Deleting account…" : "Delete account and ride data"}
            </button>
          )}
        </section>
      </main>

      <LegalFooter />
      <NavBar />
    </div>
  );
}
