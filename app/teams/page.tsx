"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { SperaIcon } from "@/components/SperaLogo";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Plus, TrendingUp, Users } from "lucide-react";

type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  averageLeagueLevel: number;
  ridersPromoted: number;
  totalDistanceKm: number;
  totalElevation: number;
  activeRiders: number;
  isCurrentUserTeam: boolean;
};

type UnassignedRider = {
  id: string;
  name: string;
  avatar: string | null;
  leagueLevel: number;
  monthlyKm: number;
};

type TeamsResponse = {
  monthKey: string;
  currentUserTeamId: string | null;
  teams: TeamSummary[];
  unassigned?: {
    count: number;
    totalDistanceKm: number;
    totalElevation: number;
    activeRiders: number;
    riders: UnassignedRider[];
  };
};

export default function TeamsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded } = useStore();
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadTeams(signal?: AbortSignal): Promise<TeamsResponse> {
    const res = await fetch("/api/teams", { signal });
    if (!res.ok) throw new Error("Teams unavailable");
    return await res.json() as TeamsResponse;
  }

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded) return;
    const controller = new AbortController();
    loadTeams(controller.signal)
      .then(setData)
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setError("Could not load teams.");
      });
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded]);

  async function mutateTeam(action: "create" | "join" | "leave", teamId?: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "create" ? { action, name } : { action, teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Team update failed");
      setData(json as TeamsResponse);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Team update failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated || !currentUser) return null;

  const teams = data?.teams ?? [];
  const leadingTeam = teams[0];

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Team development
          </p>
          <h1 className="font-bold text-foreground text-xl">Teams</h1>
        </div>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">
        <section className="glass-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">Team KPI</p>
              <h2 className="mt-2 text-3xl font-black text-foreground">Average League Level</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Teams rise by developing riders into stronger leagues, not by hiding behind one high-volume cyclist.
              </p>
            </div>
            <TrendingUp className="mt-1 text-accent-foreground" size={24} />
          </div>
          {leadingTeam && (
            <div className="mt-5 rounded-2xl border border-[#ff4b35]/25 bg-[#ff4b35]/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Leading team</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-xl font-black text-foreground">{leadingTeam.name}</p>
                <p className="text-3xl font-black text-accent-foreground">{leadingTeam.averageLeagueLevel}</p>
              </div>
            </div>
          )}
        </section>

        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus size={15} className="text-accent-foreground" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Create team</p>
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Team name"
              className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm outline-none focus:border-[#ff4b35]/50"
            />
            <button
              type="button"
              disabled={submitting || name.trim().length < 3}
              onClick={() => mutateTeam("create")}
              className="rounded-xl px-4 py-2 text-xs font-black text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#ff7a2f,#ff4b35,#e0007a)" }}
            >
              Create
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </section>

        {data && !data.currentUserTeamId && (
          <section
            className="glass-card p-4"
            style={{ borderColor: "rgba(255,75,53,0.4)", background: "rgba(255,75,53,0.06)" }}
          >
            <p className="text-xs font-black uppercase tracking-[0.14em] text-accent-foreground">
              You&apos;re riding unassigned
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Your kilometres count in your league, but not toward any team yet. Join a team below
              or create your own to start building team rankings.
            </p>
          </section>
        )}

        {teams.length === 0 ? (
          <section className="glass-card p-8 text-center">
            <Users className="mx-auto text-muted-foreground" size={24} />
            <p className="mt-3 text-sm text-muted-foreground">No teams yet. Create the first one.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {teams.map((team, index) => (
              <section
                key={team.id}
                className="glass-card p-4"
                style={team.isCurrentUserTeam ? { borderColor: "rgba(255,75,53,0.5)" } : undefined}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">#{index + 1}</p>
                    <Link href={`/teams/${team.slug}`} className="mt-1 block truncate text-xl font-black text-foreground hover:text-accent-foreground">
                      {team.name}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {team.description || `${team.memberCount} riders building league progress together.`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-accent-foreground">{team.averageLeagueLevel || "-"}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">avg league</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  <TeamMetric label="Promoted" value={String(team.ridersPromoted)} />
                  <TeamMetric label="Active" value={String(team.activeRiders)} />
                  <TeamMetric label="Distance" value={`${team.totalDistanceKm}`} />
                  <TeamMetric label="Elev m" value={`${Math.round(team.totalElevation)}`} />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => mutateTeam(team.isCurrentUserTeam ? "leave" : "join", team.id)}
                  className={cn(
                    "mt-4 w-full rounded-xl border px-4 py-2 text-xs font-black transition-all disabled:opacity-50",
                    team.isCurrentUserTeam
                      ? "border-foreground/10 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                      : "border-[#ff4b35]/40 bg-[#ff4b35]/10 text-accent-foreground"
                  )}
                >
                  {team.isCurrentUserTeam ? "Leave Team" : data?.currentUserTeamId ? "Switch To Team" : "Join Team"}
                </button>
              </section>
            ))}
          </div>
        )}

        {data?.unassigned && data.unassigned.count > 0 && (
          <section className="glass-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Unassigned Riders
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Opted-in riders without a team. They rank in their leagues — recruit them.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-foreground">{data.unassigned.count}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">riders</p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {data.unassigned.riders.map((rider) => {
                const isMe = rider.id === currentUser.id;
                return (
                  <div
                    key={rider.id}
                    className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-2.5"
                    style={isMe ? { borderColor: "rgba(255,75,53,0.4)" } : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rider.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(rider.name)}`}
                      alt={rider.name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-foreground">
                        {rider.name}
                        {isMe && <span className="ml-1.5 rounded-full bg-[#ff4b35]/15 px-1.5 py-0.5 text-[9px] font-black text-accent-foreground">YOU</span>}
                      </p>
                      <p className="text-[9px] text-muted-foreground/70">{rider.leagueLevel} Club</p>
                    </div>
                    <p className="text-xs font-black text-accent-foreground">{rider.monthlyKm} km</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <TeamMetric label="Group km" value={String(data.unassigned.totalDistanceKm)} />
              <TeamMetric label="Active" value={String(data.unassigned.activeRiders)} />
            </div>
          </section>
        )}
      </main>
      <NavBar />
    </div>
  );
}

function TeamMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-2 text-center">
      <p className="text-base font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
