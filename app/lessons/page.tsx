"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  WalletCards,
  XCircle,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { BrandMark } from "@/components/SperaLogo";
import { formatCredits, type LessonSummary } from "@/lib/lessons";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

type LessonPurchase = {
  id: string;
  lessonCount: number;
  status: "draft" | "pending_payment" | "paid" | "cancelled";
  createdAt: string;
};

type LessonSession = {
  id: string;
  purchaseId: string | null;
  status: "booked" | "completed" | "cancelled" | "no_show" | "coach_cancelled";
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  location: string | null;
  clientNotes: string | null;
};

type WalletResponse = {
  summary: LessonSummary;
  purchases: LessonPurchase[];
  sessions: LessonSession[];
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

function defaultBookingTime() {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

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

export default function LessonsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const currentUser = useStore((state) => state.currentUser);
  const isOnboarded = useStore((state) => state.isOnboarded);
  const verifiedReference = useRef<string | null>(null);
  const [wallet, setWallet] = useState<WalletResponse>({
    summary: EMPTY_SUMMARY,
    purchases: [],
    sessions: [],
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [startsAt, setStartsAt] = useState(defaultBookingTime);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [location, setLocation] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const loadWallet = useCallback(async () => {
    const response = await fetch("/api/lessons/purchases", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as WalletResponse;
    if (!response.ok) throw new Error(data.error || "Unable to load bookings");
    setWallet(data);
  }, []);

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

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const reference = searchParams.get("reference");
        const paymentState = searchParams.get("payment");
        if (paymentState === "cancelled") setNotice("Payment cancelled. Nothing was charged.");
        if (reference && verifiedReference.current !== reference) {
          verifiedReference.current = reference;
          const verifyResponse = await fetch(
            `/api/lessons/payments/verify?reference=${encodeURIComponent(reference)}`
          );
          if (verifyResponse.ok) setNotice("Payment confirmed. Your session balance is ready.");
          window.history.replaceState({}, "", "/lessons");
        }
        if (!cancelled) await loadWallet();
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load bookings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser, hydrated, isOnboarded, loadWallet, router]);

  const paidPurchases = useMemo(
    () => wallet.purchases.filter((purchase) => purchase.status === "paid"),
    [wallet.purchases]
  );
  const selectedPurchaseId = purchaseId || paidPurchases[0]?.id || "";
  const upcomingSessions = useMemo(
    () =>
      wallet.sessions
        .filter((session) => session.status === "booked")
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [wallet.sessions]
  );
  const completedSessions = useMemo(
    () =>
      wallet.sessions
        .filter((session) => session.status === "completed")
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [wallet.sessions]
  );
  const canScheduleLegacyCredit = wallet.summary.availableCredits > 0 && Boolean(selectedPurchaseId);

  async function bookLesson(event: FormEvent) {
    event.preventDefault();
    if (!selectedPurchaseId) return;
    setWorking("booking");
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/lessons/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: selectedPurchaseId,
          startsAt: new Date(startsAt).toISOString(),
          durationMinutes,
          location,
          clientNotes,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to schedule session");
      setLocation("");
      setClientNotes("");
      setStartsAt(defaultBookingTime());
      setNotice("Session scheduled. Your email confirmation and calendar invite are on the way.");
      await loadWallet();
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Unable to schedule session");
    } finally {
      setWorking(null);
    }
  }

  async function cancelLesson(sessionId: string) {
    const confirmed = window.confirm("Cancel this session and return its credit?");
    if (!confirmed) return;
    setWorking(sessionId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/lessons/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to cancel session");
      setNotice("Session cancelled and credit returned.");
      await loadWallet();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel session");
    } finally {
      setWorking(null);
    }
  }

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <BrandMark showWordmark iconClassName="h-8 w-8" />
          <div className="text-right">
            <p className="text-lg font-black text-accent-foreground">
              {formatCredits(wallet.summary.availableCredits)}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">sessions ready</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-7">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">Your coaching</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-foreground">Bookings</h1>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {notice}
          </p>
        )}

        {loading ? (
          <div className="glass-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading bookings…
          </div>
        ) : (
          <>
            <section id="upcoming" className="glass-card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Next session
              </p>
              {upcomingSessions.length ? (
                <div className="mt-4 space-y-3">
                  {upcomingSessions.map((session) => (
                    <article key={session.id} className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-black text-foreground">
                            <CalendarCheck size={15} className="text-accent-foreground" />
                            {formatWhen(session.startsAt)}
                          </p>
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock3 size={12} /> {session.durationMinutes} minutes
                          </p>
                          {session.location && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin size={12} /> {session.location}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => cancelLesson(session.id)}
                          disabled={working !== null}
                          aria-label="Cancel session"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                        >
                          {working === session.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={16} />}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-foreground/10 p-5 text-center">
                  <p className="text-sm font-bold text-foreground">Nothing scheduled yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Your next confirmed session will appear here.</p>
                </div>
              )}
            </section>

            {canScheduleLegacyCredit ? (
              <form id="book" onSubmit={bookLesson} className="glass-card p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff4b35]/10 text-accent-foreground">
                    <WalletCards size={18} />
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-foreground">Schedule your next session</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Use one of your already-paid session credits.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Paid package</span>
                    <select
                      value={selectedPurchaseId}
                      onChange={(event) => setPurchaseId(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm font-bold text-foreground outline-none"
                    >
                      {paidPurchases.map((purchase) => (
                        <option key={purchase.id} value={purchase.id}>
                          {formatCredits(purchase.lessonCount)} sessions · {format(new Date(purchase.createdAt), "d MMM yyyy")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Date and time</span>
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(event) => setStartsAt(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Duration</span>
                    <select
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm font-bold text-foreground outline-none"
                    >
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                      <option value={120}>120 minutes</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Meeting point</span>
                    <input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Anything the coach should know?</span>
                    <textarea
                      rows={3}
                      value={clientNotes}
                      onChange={(event) => setClientNotes(event.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full resize-none rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={working !== null}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b35] px-5 text-sm font-black text-white disabled:opacity-50"
                >
                  {working === "booking" ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
                  {working === "booking" ? "Scheduling…" : "Schedule session"}
                </button>
              </form>
            ) : (
              <section className="rounded-3xl bg-[#0c0c0c] p-6 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff7a64]">Ready for another?</p>
                <h2 className="mt-2 text-xl font-black">Choose your next ride.</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  One booking flow for single sessions and coaching blocks.
                </p>
                <Link
                  href="/book"
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white sm:w-auto sm:min-w-56"
                >
                  Book a ride <ArrowRight size={16} />
                </Link>
              </section>
            )}

            {completedSessions.length > 0 && (
              <section className="glass-card p-5">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  <CheckCircle2 size={13} /> Completed
                </p>
                <div className="mt-3 space-y-2">
                  {completedSessions.slice(0, 5).map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-foreground/[0.06] px-3 py-2.5 text-xs">
                      <span className="font-bold text-foreground">{format(new Date(session.startsAt), "d MMM yyyy")}</span>
                      <span className="text-muted-foreground">{session.durationMinutes} min</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <NavBar />
    </div>
  );
}
