"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import LeagueStatus from "@/components/LeagueStatus";
import { SperaIcon } from "@/components/SperaLogo";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import { Activity, MapPin, Mountain, Route } from "lucide-react";

type ZoneSummary = {
  id: string;
  name: string;
  region: string;
  type: string;
  description: string;
  totalDistanceKm: number;
  totalElevation: number;
  rideCount: number;
  gpsRides: number;
  profileRides: number;
  activeRiders: number;
  participationRate: number;
  promotions: number;
};

type ZonesResponse = {
  monthKey: string;
  zones: ZoneSummary[];
  unattributed?: {
    rides: number;
    totalDistanceKm: number;
    riders: number;
  };
};

type LeagueSummary = {
  current: {
    league: { name: string };
    monthlyKm: number;
    promotionTargetKm: number;
    remainingKm: number;
    progressPct: number;
    nextLeague: { name: string } | null;
    leagueMinKm: number;
    fastTrackedThisMonth: boolean;
    rankDistance: number | null;
    leagueRiders: number;
  };
};

export default function ZonesPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded } = useStore();
  const [data, setData] = useState<ZonesResponse | null>(null);
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded) return;
    const controller = new AbortController();
    fetch("/api/zones", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Zones unavailable");
        setData(await res.json() as ZonesResponse);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setError("Could not load zones.");
      });
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded) return;
    const controller = new AbortController();
    fetch("/api/leagues", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((leagueJson) => { if (leagueJson) setLeague(leagueJson as LeagueSummary); })
      .catch(() => {});
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded]);

  if (!hydrated || !currentUser) return null;

  const zones = data?.zones ?? [];
  const leadingZone = zones[0];

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Zone rankings</p>
          <h1 className="font-bold text-foreground text-xl">Zones</h1>
        </div>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">
        {league && (
          <LeagueStatus
            leagueName={league.current.league.name}
            monthlyKm={league.current.monthlyKm}
            promotionTargetKm={league.current.promotionTargetKm}
            remainingKm={league.current.remainingKm}
            progressPct={league.current.progressPct}
            nextLeagueName={league.current.nextLeague?.name ?? null}
            leagueMinKm={league.current.leagueMinKm}
            fastTracked={league.current.fastTrackedThisMonth}
            rank={league.current.rankDistance}
            leagueRiders={league.current.leagueRiders}
            variant="compact"
          />
        )}
        <section className="glass-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">First-class zone competition</p>
              <h2 className="mt-2 text-3xl font-black text-foreground">Local riding, visible progress</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Zones rank by synced rides — GPS-detected where available, otherwise credited to each
                rider&apos;s profile zone.
              </p>
            </div>
            <MapPin className="mt-1 text-accent-foreground" size={24} />
          </div>
          {leadingZone && (
            <div className="mt-5 rounded-2xl border border-[#ff4b35]/25 bg-[#ff4b35]/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Leading zone</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-xl font-black text-foreground">{leadingZone.name}</p>
                <p className="text-3xl font-black text-accent-foreground">{leadingZone.totalDistanceKm}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">monthly kilometres</p>
            </div>
          )}
        </section>

        {error && <p className="glass-card p-3 text-xs text-muted-foreground">{error}</p>}

        {data?.unattributed && data.unattributed.rides > 0 && (
          <section className="glass-card p-4" style={{ borderColor: "rgba(255,122,47,0.35)" }}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">
              Zone not detected yet
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {data.unattributed.totalDistanceKm} km from {data.unattributed.riders}{" "}
              rider{data.unattributed.riders === 1 ? "" : "s"} ({data.unattributed.rides}{" "}
              ride{data.unattributed.rides === 1 ? "" : "s"}) isn&apos;t counted in any zone. Those riders can
              pick a home zone in their profile, or ride with GPS for automatic detection.
            </p>
          </section>
        )}

        {zones.length === 0 ? (
          <section className="glass-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No zone activity has been synced this month.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {zones.map((zone, index) => (
              <section key={zone.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">#{index + 1} {zone.region}</p>
                    <h2 className="mt-1 truncate text-xl font-black text-foreground">{zone.name}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{zone.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-accent-foreground">{zone.totalDistanceKm}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">km</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  <ZoneMetric icon={<Mountain size={12} />} label="Elevation" value={`${zone.totalElevation}`} />
                  <ZoneMetric icon={<Activity size={12} />} label="Active" value={`${zone.activeRiders}`} />
                  <ZoneMetric icon={<Route size={12} />} label="Rides" value={`${zone.rideCount}`} />
                  <ZoneMetric icon={<MapPin size={12} />} label="Promoted" value={`${zone.promotions}`} />
                </div>

                {zone.rideCount > 0 && (
                  <p className="mt-2 text-[10px] text-muted-foreground/70">
                    {zone.gpsRides > 0 && `${zone.gpsRides} GPS-detected ride${zone.gpsRides === 1 ? "" : "s"}`}
                    {zone.gpsRides > 0 && zone.profileRides > 0 && " - "}
                    {zone.profileRides > 0 && `${zone.profileRides} via rider profile zone`}
                  </p>
                )}

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Participation</p>
                    <p className="text-[10px] font-black text-accent-foreground">{zone.participationRate}%</p>
                  </div>
                  <div className="h-2 rounded-full bg-foreground/[0.08]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, zone.participationRate)}%`,
                        background: "linear-gradient(90deg,#ff7a2f,#ff4b35,#e0007a)",
                      }}
                    />
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <NavBar />
    </div>
  );
}

function ZoneMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-2 text-center">
      <div className="mb-1 flex justify-center text-accent-foreground">{icon}</div>
      <p className="text-sm font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
