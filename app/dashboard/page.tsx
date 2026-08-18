"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bike,
  CalendarCheck,
  Clock3,
  Mail,
  Mountain,
  Route,
  User,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { BrandMark } from "@/components/SperaLogo";
import { formatCredits, type LessonSummary } from "@/lib/lessons";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

type HomeSession = {
  id: string;
  status: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
};

type HomeWallet = {
  summary: LessonSummary;
  sessions: HomeSession[];
  error?: string;
};

const EMPTY_SUMMARY: LessonSummary = {
  paidCredits: 0,
  pendingCredits: 0,
  availableCredits: 0,
  bookedCredits: 0,
  completedCredits: 0,
  forfeitedCredits: 0,
  totalPaidCents: 0,
  pendingAmountCents: 0,
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const currentUser = useStore((state) => state.currentUser);
  const isOnboarded = useStore((state) => state.isOnboarded);
  const activities = useStore((state) => state.activities);
  const hydrateActivities = useStore((state) => state.hydrateActivities);
  const [wallet, setWallet] = useState<HomeWallet>({ summary: EMPTY_SUMMARY, sessions: [] });
  const [loading, setLoading] = useState(true);
  const [nowMs] = useState(() => Date.now());

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

    const hasStrava = currentUser.isConnected;
    let cancelled = false;
    async function loadHome() {
      setLoading(true);
      const work: Promise<unknown>[] = [
        fetch("/api/lessons/purchases", { cache: "no-store" })
          .then(async (response) => {
            const data = (await response.json().catch(() => ({}))) as HomeWallet;
            if (!response.ok) throw new Error(data.error || "Unable to load bookings");
            if (!cancelled) setWallet(data);
          }),
      ];

      if (hasStrava) work.push(hydrateActivities());
      await Promise.allSettled(work);
      if (!cancelled) setLoading(false);
    }

    void loadHome();
    return () => {
      cancelled = true;
    };
  }, [currentUser, hydrated, hydrateActivities, isOnboarded, router]);

  const upcomingSession = useMemo(
    () =>
      wallet.sessions
        .filter((session) => session.status === "booked" && new Date(session.startsAt).getTime() > nowMs)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null,
    [nowMs, wallet.sessions]
  );

  const monthlyRides = useMemo(() => {
    if (!currentUser) return [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return activities.filter((activity) => {
      const date = new Date(activity.date).getTime();
      return activity.userId === currentUser.id && date >= start && date < end;
    });
  }, [activities, currentUser]);

  const monthlyKm = monthlyRides.reduce((sum, ride) => sum + ride.distance / 1000, 0);
  const monthlyMinutes = monthlyRides.reduce((sum, ride) => sum + ride.movingTime / 60, 0);
  const activeDays = new Set(monthlyRides.map((ride) => new Date(ride.date).toISOString().slice(0, 10))).size;
  const firstName = currentUser?.name.trim().split(/\s+/)[0] || "Rider";

  const primaryAction = upcomingSession
    ? {
        eyebrow: "Your next ride",
        title: formatWhen(upcomingSession.startsAt),
        body: upcomingSession.location || "Your meeting point is in the confirmation email.",
        href: "/lessons#upcoming",
        label: "View session",
        Icon: CalendarCheck,
      }
    : wallet.summary.availableCredits > 0
      ? {
          eyebrow: `${formatCredits(wallet.summary.availableCredits)} session${
            wallet.summary.availableCredits === 1 ? "" : "s"
          } ready`,
          title: "Choose your next ride",
          body: "Your package is paid. Pick the time that works for you.",
          href: "/lessons#book",
          label: "Schedule a session",
          Icon: Clock3,
        }
      : {
          eyebrow: "Ready when you are",
          title: "What do you want from your next ride?",
          body: "Choose a beginner session, a focused coaching ride, or a four-ride block.",
          href: "/book",
          label: "Book a ride",
          Icon: Bike,
        };

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <BrandMark showWordmark iconClassName="h-8 w-8" />
          <Link
            href="/profile"
            aria-label="Open profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-foreground/10 bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <User size={18} />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-7">
        <div>
          <p className="text-sm text-muted-foreground">Hi {firstName}</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-foreground">Your next move</h1>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-[#ff4b35]/30 bg-[#0c0c0c] p-6 text-white shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:p-8">
          <div aria-hidden className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#ee0075]/15 blur-3xl" />
          <div className="relative">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5b1f] to-[#ee0075]">
              <primaryAction.Icon size={21} />
            </span>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[#ff7a64]">
              {loading ? "Loading your next move" : primaryAction.eyebrow}
            </p>
            <h2 className="mt-2 max-w-xl text-2xl font-black tracking-[-0.035em] sm:text-3xl">
              {loading ? "Getting things ready…" : primaryAction.title}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/60">{primaryAction.body}</p>
            <Link
              href={primaryAction.href}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white sm:w-auto sm:min-w-56"
            >
              {primaryAction.label} <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        {currentUser.isConnected ? (
          <Link
            href="/progress"
            className="glass-card block p-5 transition-colors hover:border-[#ff4b35]/30"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">
                  Private progress
                </p>
                <h2 className="mt-1 text-lg font-black text-foreground">Your riding this month</h2>
              </div>
              <ArrowRight size={17} className="mt-1 text-muted-foreground" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <MiniMetric Icon={Route} value={`${monthlyKm.toFixed(0)} km`} label="Distance" />
              <MiniMetric Icon={Clock3} value={`${Math.round(monthlyMinutes)} min`} label="Moving" />
              <MiniMetric Icon={Bike} value={String(activeDays)} label="Active days" />
            </div>
          </Link>
        ) : (
          <section className="glass-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Optional</p>
            <h2 className="mt-1 text-lg font-black text-foreground">Want a private progress view?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Connect Strava from Progress when you want it. It is never required to book.
            </p>
          </section>
        )}

        <section className="flex items-start gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-4">
          <Mail size={18} className="mt-0.5 shrink-0 text-accent-foreground" />
          <div>
            <p className="text-sm font-black text-foreground">Simple reminders</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Booking details arrive by email. Calendar alerts remind you one day and two hours before your session.
            </p>
          </div>
        </section>
      </main>

      <NavBar />
    </div>
  );
}

function MiniMetric({
  Icon,
  value,
  label,
}: {
  Icon: typeof Mountain;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] p-3">
      <Icon size={14} className="text-accent-foreground" />
      <p className="mt-2 text-lg font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
