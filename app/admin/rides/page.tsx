"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

const DEFAULT_CAPACITY = 20;

type TeamOption = {
  id: string;
  name: string;
  slug: string;
};

type AdminRide = {
  id: string;
  team_id: string;
  starts_at: string;
  meeting_point: string | null;
  route: string;
  capacity: number;
  checkinCount: number;
  feedbackCount: number;
  isPast: boolean;
  team: TeamOption | TeamOption[] | null;
};

type FeedbackNote = {
  id: string;
  note: string;
  created_at: string;
};

function joinedTeam(team: AdminRide["team"]): TeamOption | null {
  if (!team) return null;
  return Array.isArray(team) ? team[0] ?? null : team;
}

export default function AdminRidesPage() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [teamId, setTeamId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [route, setRoute] = useState("");
  const [capacity, setCapacity] = useState(String(DEFAULT_CAPACITY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);
  const [feedbackByRide, setFeedbackByRide] = useState<Record<string, FeedbackNote[] | undefined>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rides", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to load rides");
      const nextTeams = (data.teams ?? []) as TeamOption[];
      setError("");
      setTeams(nextTeams);
      setRides((data.rides ?? []) as AdminRide[]);
      setTeamId((current) => current || nextTeams[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load rides");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/admin/rides", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to load rides");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const nextTeams = (data.teams ?? []) as TeamOption[];
        setError("");
        setTeams(nextTeams);
        setRides((data.rides ?? []) as AdminRide[]);
        setTeamId(nextTeams[0]?.id || "");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load rides");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function createRide(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!startsAt) throw new Error("Choose a date and time.");
      const localStart = new Date(startsAt);
      if (Number.isNaN(localStart.getTime())) throw new Error("Choose a valid date and time.");

      const res = await fetch("/api/admin/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          startsAt: localStart.toISOString(),
          meetingPoint,
          route,
          capacity: capacity.trim() ? Number(capacity) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to create ride");

      setStartsAt("");
      setMeetingPoint("");
      setRoute("");
      setCapacity(String(DEFAULT_CAPACITY));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create ride");
    } finally {
      setSaving(false);
    }
  }

  async function removeRide(id: string) {
    if (!window.confirm("Remove this ride? Check-ins and private feedback attached to it will also be removed.")) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/rides?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to remove ride");
      setRides((current) => current.filter((ride) => ride.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove ride");
    }
  }

  async function toggleFeedback(id: string) {
    if (feedbackByRide[id]) {
      setFeedbackByRide((current) => ({ ...current, [id]: undefined }));
      return;
    }

    setFeedbackLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(id)}/feedback`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to load private feedback");
      setFeedbackByRide((current) => ({ ...current, [id]: (data.feedback ?? []) as FeedbackNote[] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load private feedback");
    } finally {
      setFeedbackLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
            ← Founder console
          </Link>
          <h1 className="text-3xl font-black">Club rides</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Schedule free community rides for any club. SpinTribe coordinates these rides; official club membership, benefits and rewards remain governed by each club operator.
          </p>
        </header>

        <form onSubmit={createRide} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Schedule a ride</h2>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Club</span>
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" required>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Date and time</span>
            <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Meeting point</span>
            <input value={meetingPoint} onChange={(event) => setMeetingPoint(event.target.value)} maxLength={180} className="w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="e.g. Ferndale on Republic, main entrance" required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Route / pace</span>
            <textarea value={route} onChange={(event) => setRoute(event.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Short route, distance and expected pace" required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Capacity (optional, default 20; max 100)</span>
            <input type="number" min={1} max={100} value={capacity} onChange={(event) => setCapacity(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" />
          </label>

          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button type="submit" disabled={saving || !teamId} className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-50">
            {saving ? "Scheduling…" : "Publish ride"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Recent rides</h2>
              <p className="text-xs text-muted-foreground">Founder/admin may remove any ride when moderation requires it.</p>
            </div>
            <button type="button" onClick={() => void load()} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Refresh</button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading rides…</p>
          ) : rides.length === 0 ? (
            <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">No rides yet.</p>
          ) : (
            <div className="space-y-3">
              {rides.map((ride) => {
                const team = joinedTeam(ride.team);
                return (
                  <article key={ride.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{team?.name ?? "Club"}</p>
                        <h3 className="font-bold">{new Date(ride.starts_at).toLocaleString()}</h3>
                        <p className="text-sm"><span className="font-semibold">Meet:</span> {ride.meeting_point ?? "See route description"}</p>
                        <p className="text-sm text-muted-foreground">{ride.route}</p>
                        <p className="text-xs text-muted-foreground">{ride.checkinCount}/{ride.capacity} checked in · {ride.feedbackCount} private feedback note{ride.feedbackCount === 1 ? "" : "s"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        {ride.feedbackCount > 0 && (
                          <button type="button" disabled={feedbackLoading === ride.id} onClick={() => void toggleFeedback(ride.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                            {feedbackLoading === ride.id ? "Loading…" : feedbackByRide[ride.id] ? "Hide notes" : "View private notes"}
                          </button>
                        )}
                        <button type="button" onClick={() => void removeRide(ride.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                          Remove
                        </button>
                      </div>
                    </div>
                    {feedbackByRide[ride.id] && (
                      <div className="mt-4 space-y-2 border-t border-border pt-4" aria-label="Private ride feedback">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Private operational notes</p>
                        {feedbackByRide[ride.id]?.map((feedback) => (
                          <div key={feedback.id} className="rounded-xl bg-muted/50 p-3">
                            <p className="whitespace-pre-wrap break-words text-sm">{feedback.note}</p>
                            <p className="mt-2 text-[10px] text-muted-foreground">Received {new Date(feedback.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
