"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowRight,
  Bike,
  CalendarDays,
  Clock3,
  Mountain,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import PoweredByStrava from "@/components/PoweredByStrava";
import { BrandMark } from "@/components/SperaLogo";
import { type Activity } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

type Totals = {
  distanceKm: number;
  elevationM: number;
  minutes: number;
  activeDays: number;
  rides: number;
};

function activityTotals(activities: Activity[]): Totals {
  return {
    distanceKm: activities.reduce((sum, activity) => sum + activity.distance / 1000, 0),
    elevationM: activities.reduce((sum, activity) => sum + (activity.elevationGain ?? 0), 0),
    minutes: activities.reduce((sum, activity) => sum + activity.movingTime / 60, 0),
    activeDays: new Set(activities.map((activity) => new Date(activity.date).toISOString().slice(0, 10))).size,
    rides: activities.length,
  };
}

function monthActivities(activities: Activity[], userId: string, year: number, month: number) {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return activities.filter((activity) => {
    const date = new Date(activity.date).getTime();
    return activity.userId === userId && date >= start && date < end;
  });
}

export default function ProgressPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const currentUser = useStore((state) => state.currentUser);
  const isOnboarded = useStore((state) => state.isOnboarded);
  const activities = useStore((state) => state.activities);
  const hydrateActivities = useStore((state) => state.hydrateActivities);
  const syncStravaActivities = useStore((state) => state.syncStravaActivities);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) {
      router.replace("/");
      return;
    }
    if (!isOnboarded) {
      router.replace("/onboarding");
      return;
    }
    if (currentUser.isConnected) void hydrateActivities();
  }, [currentUser, hydrateActivities, hydrated, isOnboarded, router]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await syncStravaActivities();
    setSyncing(false);
  }, [syncStravaActivities]);

  const now = useMemo(() => new Date(), []);
  const currentMonth = useMemo(
    () =>
      currentUser
        ? monthActivities(activities, currentUser.id, now.getFullYear(), now.getMonth())
        : [],
    [activities, currentUser, now]
  );
  const previousMonthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now]);
  const previousMonth = useMemo(
    () =>
      currentUser
        ? monthActivities(
            activities,
            currentUser.id,
            previousMonthDate.getFullYear(),
            previousMonthDate.getMonth()
          )
        : [],
    [activities, currentUser, previousMonthDate]
  );
  const totals = activityTotals(currentMonth);
  const previousTotals = activityTotals(previousMonth);
  const recentRides = [...currentMonth].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (!hydrated || !currentUser) return null;

  if (!currentUser.isConnected) {
    return (
      <div className="min-h-screen bg-background mb-nav">
        <SimpleHeader />
        <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-lg items-center px-5 py-10">
          <section className="glass-card w-full p-7 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FC4C02]/10 text-[#FC4C02]">
              <Route size={25} />
            </span>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Optional and private
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">See your riding progress</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Connect your own Strava account to see monthly distance, elevation, active days, and moving time.
              Your rides are not shown to other clients.
            </p>
            <a
              href="/api/auth/strava"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FC4C02] px-5 text-sm font-black text-white"
            >
              Connect Strava <ArrowRight size={16} />
            </a>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldCheck size={12} /> Booking never requires Strava
            </p>
          </section>
        </main>
        <NavBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background mb-nav">
      <SimpleHeader
        action={
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground/10 bg-card px-3 text-xs font-bold text-muted-foreground disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing" : "Sync"}
          </button>
        }
      />

      <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">
              You only
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-foreground">
              {format(now, "MMMM")} progress
            </h1>
          </div>
          <PoweredByStrava />
        </div>

        <section className="grid grid-cols-2 gap-3">
          <MetricCard
            Icon={Route}
            label="Distance"
            value={`${totals.distanceKm.toFixed(0)} km`}
            comparison={comparisonText(totals.distanceKm, previousTotals.distanceKm)}
          />
          <MetricCard
            Icon={Mountain}
            label="Elevation"
            value={`${Math.round(totals.elevationM).toLocaleString("en-ZA")} m`}
            comparison={comparisonText(totals.elevationM, previousTotals.elevationM)}
          />
          <MetricCard
            Icon={CalendarDays}
            label="Active days"
            value={String(totals.activeDays)}
            comparison={comparisonText(totals.activeDays, previousTotals.activeDays)}
          />
          <MetricCard
            Icon={Clock3}
            label="Moving time"
            value={`${Math.round(totals.minutes)} min`}
            comparison={comparisonText(totals.minutes, previousTotals.minutes)}
          />
        </section>

        <section className="glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Recent rides</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {totals.rides} synced ride{totals.rides === 1 ? "" : "s"} this month
              </p>
            </div>
          </div>

          {recentRides.length ? (
            <div className="mt-4 space-y-2">
              {recentRides.slice(0, 5).map((ride) => (
                <a
                  key={ride.id}
                  href={`https://www.strava.com/activities/${encodeURIComponent(ride.stravaId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.025] p-3 transition-colors hover:border-[#FC4C02]/30"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FC4C02]/10 text-[#FC4C02]">
                    <Bike size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-foreground">{ride.name}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {format(new Date(ride.date), "d MMM")}
                    </span>
                  </span>
                  <span className="text-sm font-black text-foreground">{(ride.distance / 1000).toFixed(1)} km</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-foreground/10 p-6 text-center">
              <p className="text-sm font-bold text-foreground">No rides synced this month</p>
              <p className="mt-1 text-xs text-muted-foreground">Use Sync after your next Strava upload.</p>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-[#0c0c0c] p-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff7a64]">Want support?</p>
          <h2 className="mt-2 text-xl font-black">Make your next ride coached.</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Choose the session that matches where you are now. No comparisons and no pressure.
          </p>
          <Link
            href="/book"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white sm:w-auto sm:min-w-56"
          >
            Book a coached ride <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <NavBar />
    </div>
  );
}

function SimpleHeader({ action }: { action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 glass-header px-5 py-4">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <BrandMark showWordmark iconClassName="h-8 w-8" />
        {action}
      </div>
    </header>
  );
}

function comparisonText(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? "First month in view" : "Ready for your next ride";
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return "Same as last month";
  return `${Math.abs(change)}% ${change > 0 ? "up" : "down"} vs last month`;
}

function MetricCard({
  Icon,
  label,
  value,
  comparison,
}: {
  Icon: typeof Route;
  label: string;
  value: string;
  comparison: string;
}) {
  return (
    <article className="glass-card p-4 sm:p-5">
      <Icon size={17} className="text-accent-foreground" />
      <p className="mt-4 text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-3 text-[10px] leading-4 text-muted-foreground/70">{comparison}</p>
    </article>
  );
}
