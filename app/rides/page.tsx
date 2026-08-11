"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Flag, Loader2, MapPin, Users } from "lucide-react";
import NavBar from "@/components/NavBar";
import { formatRideWhen, TeamRide } from "@/lib/team-rides";

/**
 * Team Vitality rides — the free community hub.
 *
 * Publicly readable: a visitor sees the rides before being asked to join.
 * Acting on a ride needs champ membership, and every action is re-checked
 * server-side; `viewer` here only decides what to render.
 */

type Viewer = { userId: string | null; isChamp: boolean; isAdmin: boolean };

type Attendee = { name: string; checkedInAt: string };

type RidesPayload = { rides: TeamRide[]; viewer?: Viewer };

async function fetchRides(): Promise<RidesPayload> {
  const response = await fetch("/api/rides");
  const data = (await response.json()) as { rides?: TeamRide[]; viewer?: Viewer; error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load rides");
  return { rides: data.rides ?? [], viewer: data.viewer };
}

export default function RidesPage() {
  const [rides, setRides] = useState<TeamRide[]>([]);
  const [viewer, setViewer] = useState<Viewer>({ userId: null, isChamp: false, isAdmin: false });
  const [loading, setLoading] = useState(true);
  const [busyRideId, setBusyRideId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchRides();
        if (cancelled) return;
        setRides(data.rides);
        if (data.viewer) setViewer(data.viewer);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load rides");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Post-action reload. Not called from an effect, so it may setState freely. */
  async function refresh() {
    const data = await fetchRides();
    setRides(data.rides);
    if (data.viewer) setViewer(data.viewer);
  }

  async function act(rideId: string, path: string, body?: Record<string, unknown>) {
    setBusyRideId(rideId);
    setError("");
    try {
      const response = await fetch(`/api/rides/${rideId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "That didn't work");
      await refresh();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "That didn't work");
      return false;
    } finally {
      setBusyRideId(null);
    }
  }

  async function loadAttendees(rideId: string) {
    if (attendees[rideId]) {
      setAttendees((current) => {
        const next = { ...current };
        delete next[rideId];
        return next;
      });
      return;
    }
    const response = await fetch(`/api/rides/${rideId}`);
    if (!response.ok) return;
    const data = (await response.json()) as { attendees?: Attendee[] };
    setAttendees((current) => ({ ...current, [rideId]: data.attendees ?? [] }));
  }

  async function submitFeedback(rideId: string) {
    const ok = await act(rideId, "/feedback", { note });
    if (ok) {
      setNote("");
      setFeedbackFor(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 md:max-w-3xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ff4b35]/12 text-accent-foreground">
            <Users size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Team Vitality
            </p>
            <h1 className="text-xl font-black leading-tight text-foreground">Club rides</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-4 px-5 py-6 mb-nav md:max-w-3xl">
        {!viewer.isChamp && (
          <section className="glass-card space-y-3 p-5">
            <p className="text-sm font-black text-foreground">Ride with the club — free</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Team Vitality is free to join. No payment, no Strava account needed. Coaching is
              separate and entirely optional.
            </p>
            <Link
              href="/join"
              className="flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white"
            >
              Join Team Vitality — Free
            </Link>
          </section>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="glass-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Loading rides…
          </div>
        ) : rides.length === 0 ? (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">
            No rides scheduled yet. Check back soon.
          </div>
        ) : (
          rides.map((ride) => {
            const busy = busyRideId === ride.id;
            const showing = attendees[ride.id];

            return (
              <article key={ride.id} className="glass-card space-y-3 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-black text-foreground">{ride.title}</h2>
                  <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarDays size={12} aria-hidden />
                    {formatRideWhen(ride.startsAt)} · {ride.durationMinutes} min
                  </p>
                  {ride.meetingPoint && (
                    <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <MapPin size={12} aria-hidden />
                      {ride.meetingPoint}
                    </p>
                  )}
                  {ride.route && (
                    <p className="text-[11px] leading-5 text-muted-foreground">{ride.route}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff4b35]/10 px-2.5 py-1 font-black text-accent-foreground">
                    <Users size={11} aria-hidden />
                    {ride.checkinCount} checked in
                  </span>
                  {ride.captainName ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-bold text-muted-foreground">
                      <Flag size={11} aria-hidden />
                      Captain: {ride.captainName}
                    </span>
                  ) : (
                    <span className="rounded-full border border-border px-2.5 py-1 font-bold text-muted-foreground">
                      No captain yet
                    </span>
                  )}
                </div>

                {viewer.isChamp && (
                  <div className="space-y-2">
                    {ride.captainOpen && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(ride.id, "/captain")}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#ff4b35]/40 bg-[#ff4b35]/10 px-4 text-xs font-black text-accent-foreground disabled:opacity-50"
                      >
                        {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
                        Captain this ride
                      </button>
                    )}

                    {ride.checkInOpen &&
                      (ride.viewerCheckedIn ? (
                        <p className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 text-xs font-black text-emerald-700 dark:text-emerald-300">
                          <Check size={14} aria-hidden /> You&apos;re checked in
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || ride.full}
                          onClick={() => act(ride.id, "/checkin")}
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-4 text-xs font-black text-white disabled:opacity-50"
                        >
                          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
                          {ride.full ? "Ride is full" : "Check in"}
                        </button>
                      ))}

                    {ride.viewerIsCaptain && (
                      <button
                        type="button"
                        onClick={() => loadAttendees(ride.id)}
                        className="w-full rounded-xl border border-border px-4 py-2.5 text-[11px] font-bold text-muted-foreground"
                      >
                        {showing ? "Hide who's in" : "See who's checked in"}
                      </button>
                    )}

                    {showing && (
                      <ul className="space-y-1 rounded-xl border border-border p-3">
                        {showing.length === 0 ? (
                          <li className="text-[11px] text-muted-foreground">Nobody yet.</li>
                        ) : (
                          showing.map((attendee) => (
                            <li
                              key={`${ride.id}-${attendee.name}-${attendee.checkedInAt}`}
                              className="flex items-center gap-2 text-[11px] text-foreground"
                            >
                              <Check size={11} className="text-accent-foreground" aria-hidden />
                              {attendee.name}
                            </li>
                          ))
                        )}
                      </ul>
                    )}

                    {/* Deliberately understated: feedback is the lowest-priority
                        surface here until it proves it produces useful notes. */}
                    {ride.feedbackOpen &&
                      (ride.viewerLeftFeedback ? (
                        <p className="text-center text-[11px] text-muted-foreground">
                          Thanks — your note is with Spera.
                        </p>
                      ) : feedbackFor === ride.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={3}
                            maxLength={2000}
                            placeholder="Anything to flag about this ride?"
                            className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[#ff4b35]"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Private — only Spera sees this.
                          </p>
                          <button
                            type="button"
                            disabled={busy || !note.trim()}
                            onClick={() => submitFeedback(ride.id)}
                            className="w-full rounded-xl border border-border px-4 py-2.5 text-[11px] font-black text-foreground disabled:opacity-50"
                          >
                            Send note
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackFor(ride.id);
                            setNote("");
                          }}
                          className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Leave a private note
                        </button>
                      ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </main>

      <NavBar />
    </div>
  );
}
