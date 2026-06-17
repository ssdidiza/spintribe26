"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import { SperaIcon } from "@/components/SperaLogo";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import { Bike, Users } from "lucide-react";

type TeamProfile = {
  team: {
    name: string;
    slug: string;
    description: string | null;
    banner_url: string | null;
    logo_url: string | null;
  };
  stats: {
    memberCount: number;
    averageLeagueLevel: number;
    totalDistanceKm: number;
    totalElevation: number;
    activeRiders: number;
    yourContributionKm: number;
    viewerIsMember: boolean;
  };
  members: {
    id: string;
    name: string;
    avatar: string | null;
    role: string;
    leagueName: string;
    leagueLevel: number;
    zone: string | null;
    isViewer?: boolean;
  }[];
};

export default function TeamProfilePage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded } = useStore();
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded || !params.slug) return;
    const controller = new AbortController();
    fetch(`/api/teams/${params.slug}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Team profile unavailable");
        setProfile(await res.json() as TeamProfile);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setError("Could not load this team.");
      });
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded, params.slug]);

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Team profile</p>
          <h1 className="font-bold text-foreground text-xl">{profile?.team.name ?? "Team"}</h1>
        </div>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">
        {error && <p className="glass-card p-3 text-xs text-muted-foreground">{error}</p>}

        <section className="glass-card overflow-hidden">
          <div
            className="h-32 border-b border-foreground/10"
            style={{
              backgroundImage: profile?.team.banner_url
                ? `url(${profile.team.banner_url})`
                : "radial-gradient(circle at 20% 20%, rgba(255,75,53,0.32), transparent 18rem), linear-gradient(135deg, rgba(255,122,47,0.22), rgba(224,0,122,0.14))",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent-foreground">SpinTribe team</p>
                <h2 className="mt-2 text-3xl font-black text-foreground">{profile?.team.name ?? "Loading..."}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {profile?.team.description ?? "Team stats update from synced Strava rides and current league memberships."}
                </p>
              </div>
              <div className="rounded-2xl border border-[#ff4b35]/25 bg-[#ff4b35]/10 px-3 py-2 text-right">
                <p className="text-3xl font-black text-accent-foreground">{profile?.stats.averageLeagueLevel ?? "-"}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">avg league</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-2">
              <TeamStat label="Members" value={String(profile?.stats.memberCount ?? "-")} />
              <TeamStat label="Active" value={String(profile?.stats.activeRiders ?? "-")} />
              <TeamStat label="Distance" value={`${profile?.stats.totalDistanceKm ?? "-"} km`} />
              <TeamStat label="Elev" value={`${profile?.stats.totalElevation ?? "-"} m`} />
            </div>
          </div>
        </section>

        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={15} className="text-accent-foreground" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Members</p>
          </div>
          <div className="space-y-2">
            {(profile?.members ?? []).map((member) => (
              <div key={member.id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3">
                {member.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.avatar}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
                    <Users size={16} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground">
                    {member.name}
                    {member.isViewer && (
                      <span className="ml-1.5 rounded-full bg-[#ff4b35]/15 px-1.5 py-0.5 text-[9px] font-black text-accent-foreground">YOU</span>
                    )}
                  </p>
                  {member.zone && <p className="truncate text-[10px] text-muted-foreground">{member.zone}</p>}
                </div>
                <p className="text-xs font-black text-accent-foreground">{member.leagueName}</p>
              </div>
            ))}
            {profile && profile.members.length === 0 && (
              <p className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-xs text-muted-foreground">
                No members yet.
              </p>
            )}
          </div>
        </section>

        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bike size={15} className="text-accent-foreground" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Your contribution</p>
          </div>
          {profile?.stats.viewerIsMember ? (
            <div className="rounded-xl border border-[#ff4b35]/25 bg-[#ff4b35]/10 p-4">
              <p className="text-3xl font-black text-accent-foreground">{profile.stats.yourContributionKm} km</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Your synced cycling distance counted toward this team this month. Other riders&apos;
                individual rides stay private to them — only team totals are shared.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-xs leading-relaxed text-muted-foreground">
              Join this team to add your monthly distance to its totals. Individual rides are never
              shown for other riders — only privacy-safe team aggregates.
            </p>
          )}
        </section>
      </main>
      <NavBar />
    </div>
  );
}

function TeamStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-2 text-center">
      <p className="text-sm font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
