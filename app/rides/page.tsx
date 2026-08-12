"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClientNow } from "@/lib/useClientNow";
import type { TeamRide } from "@/lib/types";

async function fetchRides(): Promise<TeamRide[]> {
  const response = await fetch("/api/rides", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load rides.");
  return result.rides ?? [];
}

export default function RidesPage() {
  const [rides, setRides] = useState<TeamRide[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const now = useClientNow();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchRides();
        if (!cancelled) setRides(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load rides.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function captain(id: string) {
    setWorking(id);
    setError("");
    try {
      const response = await fetch(`/api/rides/${id}/captain`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not claim ride.");
      setRides(await fetchRides());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim ride.");
    } finally {
      setWorking(null);
    }
  }

  async function checkIn(id: string) {
    setWorking(id);
    try {
      const response = await fetch(`/api/rides/${id}/checkin`, { method: "POST" });
      const result = await response.json();
      setError(response.ok ? "" : result.error || "Check-in failed.");
    } catch {
      setError("Check-in failed.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 pb-28 pt-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Team Vitality</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Ride together.</h1>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">Scheduled rides for champs. No coaching purchase required.</p>

        {error && <p role="alert" className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
        {loading && <p className="mt-8 text-sm text-muted-foreground">Loading rides…</p>}
        {!loading && !error && rides.length === 0 && <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">No upcoming rides yet. Check back soon.</div>}

        <div className="mt-8 space-y-4">
          {rides.map((ride) => {
            const date = new Date(ride.starts_at);
            const rideDay = now !== null && date.toDateString() === new Date(now).toDateString();
            return (
              <article key={ride.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-white/45">{date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}</p>
                    <h2 className="mt-2 text-xl font-black">{ride.route}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })} · {ride.capacity} spots</p>
                  </div>
                  {ride.captain ? <p className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/70">Captain: {ride.captain.name}</p> : (
                    <button onClick={() => captain(ride.id)} disabled={working === ride.id} className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{working === ride.id ? "Claiming…" : "Captain this ride"}</button>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {rideDay && <button onClick={() => checkIn(ride.id)} disabled={working === ride.id} className="rounded-xl bg-gradient-to-r from-[#ff5b1f] to-[#ee0075] px-4 py-2.5 text-sm font-black text-white">{working === ride.id ? "Checking in…" : "Check in"}</button>}
                  <Link href={`/rides/${ride.id}`} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 hover:text-white">Ride details</Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
