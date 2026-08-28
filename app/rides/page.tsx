"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { isRideCheckInOpen } from "@/lib/club-rides";
import { useClientNow } from "@/lib/useClientNow";

type TeamSummary = {
  id: string;
  name: string;
  slug: string;
};

type Membership = {
  team_id: string;
  role: "member" | "champion";
  is_primary: boolean;
  team: TeamSummary | null;
};

type Ride = {
  id: string;
  team_id: string;
  starts_at: string;
  meeting_point: string | null;
  route: string;
  capacity: number;
  captain_id?: string | null;
  created_by?: string | null;
  checkinCount: number;
  canCancel?: boolean;
  isPast?: boolean;
  team: TeamSummary | TeamSummary[] | null;
  captain?: { strava_id: string; name: string | null } | { strava_id: string; name: string | null }[] | null;
};

function firstJoined<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function RidesPage() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [teamId, setTeamId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [route, setRoute] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const now = useClientNow();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/rides", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load rides.");
      const nextMemberships = (result.memberships ?? []) as Membership[];
      setError("");
      setRides((result.rides ?? []) as Ride[]);
      setMemberships(nextMemberships);
      setIsPublic(Boolean(result.public));
      setTeamId((current) => current || nextMemberships[0]?.team_id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load rides.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/rides", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load rides.");
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        const nextMemberships = (result.memberships ?? []) as Membership[];
        setError("");
        setRides((result.rides ?? []) as Ride[]);
        setMemberships(nextMemberships);
        setIsPublic(Boolean(result.public));
        setTeamId(nextMemberships[0]?.team_id || "");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load rides.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const includesTeamVitality = useMemo(
    () => memberships.some((membership) => membership.team?.slug === "team-vitality")
      || rides.some((ride) => firstJoined(ride.team)?.slug === "team-vitality"),
    [memberships, rides],
  );

  async function createRide(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      if (!startsAt) throw new Error("Choose a date and time.");
      const localStart = new Date(startsAt);
      if (Number.isNaN(localStart.getTime())) throw new Error("Choose a valid date and time.");

      const response = await fetch("/api/rides", {
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
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create ride.");
      setStartsAt("");
      setMeetingPoint("");
      setRoute("");
      setCapacity("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create ride.");
    } finally {
      setCreating(false);
    }
  }

  async function act(id: string, action: "captain" | "checkin" | "cancel") {
    setWorking(`${action}:${id}`);
    setError("");
    try {
      const url = action === "cancel" ? `/api/rides/${id}` : `/api/rides/${id}/${action}`;
      const response = await fetch(url, { method: action === "cancel" ? "DELETE" : "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Could not ${action} ride.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ride action failed.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 pb-28 pt-8 text-foreground">
      <div className="mx-auto max-w-2xl space-y-7">
        <header className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Community rides</p>
          <h1 className="text-3xl font-black">Ride with your club</h1>
          <p className="text-sm text-muted-foreground">
            {isPublic
              ? "Discover upcoming and recent Team Vitality community rides before you join. Rider identities and private feedback are never shown here."
              : "Club champions can publish group rides directly. SpinTribe coordinates the ride listing; club membership, benefits and official programmes remain with the club operator."}
          </p>
          {includesTeamVitality && (
            <p className="text-xs text-muted-foreground">
              Team Vitality rewards and official eligibility are governed by Discovery&apos;s rules and decisions.
            </p>
          )}
          {isPublic && (
            <Link href="/join" className="inline-flex rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background">
              Join Team Vitality — free
            </Link>
          )}
        </header>

        {memberships.length > 0 && (
          <form onSubmit={createRide} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <h2 className="font-bold">Create a group ride</h2>
              <p className="text-xs text-muted-foreground">You become captain automatically. Maximum capacity is 100; up to 5 new rides per rolling 7 days.</p>
            </div>

            {memberships.length > 1 ? (
              <label className="block space-y-1 text-sm">
                <span className="font-semibold">Club</span>
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" required>
                  {memberships.map((membership) => (
                    <option key={membership.team_id} value={membership.team_id}>{membership.team?.name ?? "Club"}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{memberships[0]?.team?.name ?? "Your club"}</p>
            )}

            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Date and time</span>
              <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Meeting point</span>
              <input value={meetingPoint} onChange={(event) => setMeetingPoint(event.target.value)} maxLength={180} className="w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Where should everyone meet?" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Route / pace</span>
              <textarea value={route} onChange={(event) => setRoute(event.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Short route, distance and expected pace" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Capacity (optional)</span>
              <input type="number" min={1} max={100} value={capacity} onChange={(event) => setCapacity(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="20" />
            </label>

            <button type="submit" disabled={creating || !teamId} className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-50">
              {creating ? "Publishing…" : "Publish ride"}
            </button>
          </form>
        )}

        {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{isPublic ? "Team Vitality rides" : "Upcoming rides"}</h2>
              <p className="text-xs text-muted-foreground">
                {isPublic ? "Upcoming rides appear first, followed by recent completed rides." : "Check-in is server-enforced within 12 hours of ride start."}
              </p>
            </div>
            <button type="button" onClick={() => void load()} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Refresh</button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading rides…</p>
          ) : rides.length === 0 ? (
            <div className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
              <p>{isPublic ? "No Team Vitality rides have been published in the last 90 days." : "No upcoming rides for your clubs yet."}</p>
              {isPublic && <Link href="/join" className="mt-3 inline-flex font-bold text-foreground underline underline-offset-4">Join the free community</Link>}
            </div>
          ) : (
            rides.map((ride) => {
              const team = firstJoined(ride.team);
              const captain = firstJoined(ride.captain);
              const checkinOpen = !isPublic && now !== null && isRideCheckInOpen(ride.starts_at, now);
              return (
                <article key={ride.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {team?.name ?? "Club ride"}{ride.isPast ? " · Completed" : ""}
                    </p>
                    <h3 className="text-lg font-bold">{new Date(ride.starts_at).toLocaleString()}</h3>
                    <p className="text-sm"><span className="font-semibold">Meet:</span> {ride.meeting_point ?? "See route description"}</p>
                    <p className="text-sm text-muted-foreground">{ride.route}</p>
                    <p className="text-xs text-muted-foreground">
                      {isPublic ? `${ride.checkinCount}/${ride.capacity} riders checked in` : `Captain: ${captain?.name ?? "Open"} · ${ride.checkinCount}/${ride.capacity} checked in`}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!isPublic && <Link href={`/rides/${ride.id}`} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Details</Link>}
                    {!isPublic && !ride.captain_id && (
                      <button type="button" disabled={working !== null} onClick={() => void act(ride.id, "captain")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                        {working === `captain:${ride.id}` ? "Claiming…" : "Captain this ride"}
                      </button>
                    )}
                    {checkinOpen && (
                      <button type="button" disabled={working !== null || ride.checkinCount >= ride.capacity} onClick={() => void act(ride.id, "checkin")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-50">
                        {working === `checkin:${ride.id}` ? "Checking in…" : ride.checkinCount >= ride.capacity ? "Ride full" : "Check in"}
                      </button>
                    )}
                    {ride.canCancel && (
                      <button type="button" disabled={working !== null} onClick={() => void act(ride.id, "cancel")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                        {working === `cancel:${ride.id}` ? "Cancelling…" : "Cancel my ride"}
                      </button>
                    )}
                    {isPublic && !ride.isPast && (
                      <Link href="/join" className="rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background">Join to take part</Link>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
      <NavBar />
    </main>
  );
}
