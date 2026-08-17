"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type TeamSummary = { id: string; name: string; slug: string };
type Captain = { strava_id: string; name: string | null };

type RideDetails = {
  ride: {
    id: string;
    team_id: string;
    starts_at: string;
    meeting_point: string | null;
    route: string;
    capacity: number;
    captain_id: string | null;
    created_by: string | null;
    team: TeamSummary | TeamSummary[] | null;
    captain: Captain | Captain[] | null;
  };
  checkinCount: number;
  myCheckin: { id: string; checked_in_at: string } | null;
  isCaptain: boolean;
  canCancel: boolean;
  checkinOpen: boolean;
  feedbackOpen: boolean;
};

function firstJoined<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function RideDetailsPage() {
  const params = useParams<{ id: string }>();
  const [details, setDetails] = useState<RideDetails | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/rides/${params.id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load ride.");
      setError("");
      setDetails(result as RideDetails);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load ride.");
    }
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/rides/${params.id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load ride.");
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        setError("");
        setDetails(result as RideDetails);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load ride.");
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function rideAction(action: "captain" | "checkin" | "cancel") {
    setWorking(true);
    setError("");
    try {
      const url = action === "cancel" ? `/api/rides/${params.id}` : `/api/rides/${params.id}/${action}`;
      const response = await fetch(url, { method: action === "cancel" ? "DELETE" : "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ride action failed.");
      if (action === "cancel") {
        window.location.href = "/rides";
        return;
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ride action failed.");
    } finally {
      setWorking(false);
    }
  }

  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/rides/${params.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save feedback.");
      setMessage("Thanks — your feedback is private to the admin team.");
      setNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save feedback.");
    } finally {
      setWorking(false);
    }
  }

  if (!details && error) {
    return <main className="min-h-screen bg-background p-6 text-foreground"><p className="text-sm text-red-500">{error}</p></main>;
  }
  if (!details) return <main className="min-h-screen bg-background p-6 text-muted-foreground">Loading ride…</main>;

  const ride = details.ride;
  const team = firstJoined(ride.team);
  const captain = firstJoined(ride.captain);
  const date = new Date(ride.starts_at);

  return (
    <main className="min-h-screen bg-background px-6 pb-28 pt-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link href="/rides" className="text-sm text-muted-foreground hover:text-foreground">← All rides</Link>
        <p className="mt-10 text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">{team?.name ?? "Club ride"}</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">{ride.route}</h1>
        <p className="mt-3 text-muted-foreground">
          {date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}
        </p>
        <p className="mt-2 text-sm"><span className="font-semibold">Meeting point:</span> {ride.meeting_point ?? "See route description"}</p>

        {team?.slug === "team-vitality" && (
          <p className="mt-4 text-xs text-muted-foreground">Official Team Vitality rewards and eligibility are governed by Discovery&apos;s rules and decisions.</p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Captain</p>
            <p className="mt-2 font-bold">{captain?.name ?? "Not claimed yet"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Checked in</p>
            <p className="mt-2 font-bold">{details.checkinCount} / {ride.capacity}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!ride.captain_id && (
            <button type="button" disabled={working} onClick={() => void rideAction("captain")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Captain this ride</button>
          )}
          {details.checkinOpen && !details.myCheckin && (
            <button type="button" disabled={working || details.checkinCount >= ride.capacity} onClick={() => void rideAction("checkin")} className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-50">Check in</button>
          )}
          {details.myCheckin && <span className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Checked in</span>}
          {details.canCancel && (
            <button type="button" disabled={working} onClick={() => void rideAction("cancel")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel my ride</button>
          )}
        </div>

        {details.isCaptain && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5">
            <p className="font-black">You&apos;re the captain.</p>
            <p className="mt-1 text-sm text-muted-foreground">Use the check-in count to keep the group moving.</p>
          </div>
        )}

        {details.feedbackOpen && (
          <form onSubmit={submitFeedback} className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">After the ride</p>
            <h2 className="mt-2 text-xl font-black">How did it go?</h2>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="One thing we should know…" className="mt-4 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-4 text-sm outline-none" />
            <button disabled={working || !note.trim()} className="mt-3 rounded-xl bg-foreground px-4 py-2.5 text-sm font-black text-background disabled:opacity-40">Send private feedback</button>
            {message && <p className="mt-3 text-sm text-green-500">{message}</p>}
          </form>
        )}

        {error && <p role="alert" className="mt-5 text-sm text-red-500">{error}</p>}
      </div>
    </main>
  );
}
