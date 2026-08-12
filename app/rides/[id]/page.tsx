"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useClientNow } from "@/lib/useClientNow";
import type { RideDetailsResponse } from "@/lib/types";

async function fetchRide(id: string): Promise<RideDetailsResponse> {
  const response = await fetch(`/api/rides/${id}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load ride.");
  return result;
}

export default function RideDetailsPage() {
  const params = useParams<{ id: string }>();
  const [ride, setRide] = useState<RideDetailsResponse | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const now = useClientNow();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchRide(params.id);
        if (!cancelled) setRide(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load ride.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/rides/${params.id}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Could not save feedback.");
    else { setError(""); setMessage("Thanks — your feedback is private to the admin team."); setNote(""); }
  }

  if (error && !ride) return <main className="min-h-screen bg-background p-6 text-foreground"><p className="text-sm text-red-300">{error}</p></main>;
  if (!ride) return <main className="min-h-screen bg-background p-6 text-muted-foreground">Loading ride…</main>;

  const date = new Date(ride.ride.starts_at);
  const started = now !== null && now >= date.getTime();

  return (
    <main className="min-h-screen bg-background px-6 pb-28 pt-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link href="/rides" className="text-sm text-muted-foreground hover:text-foreground">← All rides</Link>
        <p className="mt-10 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Team Vitality</p>
        <h1 className="mt-2 text-4xl font-black">{ride.ride.route}</h1>
        <p className="mt-3 text-muted-foreground">{date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} · {date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Captain</p><p className="mt-2 font-bold">{ride.ride.captain?.name ?? "Not claimed yet"}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Checked in</p><p className="mt-2 font-bold">{ride.checkinCount} / {ride.ride.capacity}</p></div>
        </div>

        {ride.isCaptain && <div className="mt-5 rounded-2xl border border-[#ff4b35]/20 bg-[#ff4b35]/5 p-5"><p className="font-black">You&apos;re the captain.</p><p className="mt-1 text-sm text-muted-foreground">Use the check-in count to keep the group moving.</p></div>}

        {started && <form onSubmit={submitFeedback} className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">After the ride</p><h2 className="mt-2 text-xl font-black">How did it go?</h2><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="One thing we should know…" className="mt-4 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm outline-none focus:border-[#ff4b35]" /><button disabled={!note.trim()} className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black disabled:opacity-40">Send private feedback</button>{message && <p className="mt-3 text-sm text-green-300">{message}</p>}</form>}
      </div>
    </main>
  );
}
