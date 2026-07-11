"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Bike,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  MapPin,
  ReceiptText,
  WalletCards,
  XCircle,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { calculateLessonPurchase, formatCredits, formatMoneyCents, LessonSummary } from "@/lib/lessons";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

type LessonPurchase = {
  id: string;
  lessonCount: number;
  unitPriceCents: number;
  discountPercent: number;
  totalAmountCents: number;
  currency: string;
  status: "draft" | "pending_payment" | "paid" | "cancelled";
  description: string | null;
  xeroInvoiceNumber: string | null;
  xeroSyncStatus: string | null;
  payfastReference: string | null;
  payfastCheckoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

type LessonSession = {
  id: string;
  purchaseId: string | null;
  status: "booked" | "completed" | "cancelled" | "no_show" | "coach_cancelled";
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  creditAmount: number;
  location: string | null;
  notes: string | null;
  clientNotes: string | null;
};

type WalletResponse = {
  summary: LessonSummary;
  purchases: LessonPurchase[];
  sessions: LessonSession[];
  ledger: {
    id: string;
    eventType: string;
    creditDelta: number;
    reason: string | null;
    createdAt: string;
  }[];
  lessonRides: {
    id: number;
    strava_id: string;
    name: string;
    distance: number | string;
    elevation_gain: number | string;
    moving_time: number;
    type: string;
    date: string;
    attribution?: { notes?: string | null; session_id?: string | null };
  }[];
  payment?: {
    authorizationUrl: string;
    reference: string;
  } | null;
  paymentUnavailable?: boolean;
  xeroWarning?: string | null;
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

async function readResponse(response: Response) {
  return response.json().catch(() => ({})) as Promise<WalletResponse>;
}

export default function LessonsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const currentUser = useStore((state) => state.currentUser);
  const isOnboarded = useStore((state) => state.isOnboarded);
  const currentUserId = currentUser?.id;
  const verifiedReference = useRef<string | null>(null);

  const [wallet, setWallet] = useState<WalletResponse>({
    summary: EMPTY_SUMMARY,
    purchases: [],
    sessions: [],
    ledger: [],
    lessonRides: [],
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [lessonCount, setLessonCount] = useState(1);
  const [customerEmail, setCustomerEmail] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [startsAt, setStartsAt] = useState(defaultBookingTime);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [location, setLocation] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const loadWallet = useCallback(async () => {
    setError("");
    const [response, ridesResponse] = await Promise.all([
      fetch("/api/lessons/purchases", { cache: "no-store" }),
      fetch("/api/lessons/rides", { cache: "no-store" }),
    ]);
    const data = await readResponse(response);
    const ridesData = await ridesResponse.json().catch(() => ({})) as {
      rides?: WalletResponse["lessonRides"];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "Unable to load lesson wallet");
    if (!ridesResponse.ok) throw new Error(ridesData.error || "Unable to load lesson rides");
    setWallet({ ...data, lessonRides: ridesData.rides ?? [] });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUserId) {
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
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const reference = searchParams.get("reference");
        const paymentState = searchParams.get("payment");
        if (paymentState === "cancelled") setNotice("Payment cancelled. Your lesson package remains unpaid.");
        if (paymentState === "already_paid") setNotice("This lesson package is already paid.");
        if (reference && verifiedReference.current !== reference) {
          verifiedReference.current = reference;
          let confirmed = false;
          for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
            const verifyResponse = await fetch(`/api/lessons/payments/verify?reference=${encodeURIComponent(reference)}`);
            const verifyData = await verifyResponse.json().catch(() => ({})) as { error?: string };
            if (verifyResponse.ok) {
              confirmed = true;
              break;
            }
            if (verifyResponse.status !== 409) {
              throw new Error(verifyData.error || "Unable to verify payment");
            }
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
          }
          setNotice(confirmed
            ? "Payment confirmed. Lesson credits are ready."
            : "PayFast is still confirming the payment. Your credits will appear shortly.");
          window.history.replaceState({}, "", "/lessons");
        }
        if (!cancelled) await loadWallet();
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load lessons");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, hydrated, isOnboarded, loadWallet, router]);

  const paidPurchases = useMemo(
    () => wallet.purchases.filter((purchase) => purchase.status === "paid"),
    [wallet.purchases]
  );
  const upcomingSessions = useMemo(
    () => wallet.sessions
      .filter((lessonSession) => lessonSession.status === "booked")
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [wallet.sessions]
  );
  const history = useMemo(
    () => wallet.sessions
      .filter((lessonSession) => lessonSession.status !== "booked")
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [wallet.sessions]
  );
  const packagePricing = useMemo(
    () => calculateLessonPurchase({ lessonCount: Math.max(1, lessonCount) }),
    [lessonCount]
  );
  const selectedPurchaseId = purchaseId || paidPurchases[0]?.id || "";

  async function buyLessons(event: FormEvent) {
    event.preventDefault();
    setWorking("purchase");
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/lessons/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonCount,
          customerEmail,
          createPayment: true,
          description: "Cycling lesson package",
        }),
      });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || "Unable to create lesson package");

      setWallet(data);
      if (data.payment?.authorizationUrl) {
        window.location.assign(data.payment.authorizationUrl);
        return;
      }
      setNotice(data.paymentUnavailable
        ? "The package was saved, but PayFast is not configured yet."
        : "Lesson package created.");
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : "Unable to create lesson package");
    } finally {
      setWorking(null);
    }
  }

  async function bookLesson(event: FormEvent) {
    event.preventDefault();
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
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to book lesson");

      setLocation("");
      setClientNotes("");
      setStartsAt(defaultBookingTime());
      setNotice("Lesson requested and credit reserved.");
      await loadWallet();
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Unable to book lesson");
    } finally {
      setWorking(null);
    }
  }

  async function cancelLesson(sessionId: string) {
    setWorking(sessionId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/lessons/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to cancel lesson");
      setNotice("Lesson cancelled and credit returned.");
      await loadWallet();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel lesson");
    } finally {
      setWorking(null);
    }
  }

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between md:max-w-4xl">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff4b35]/12 text-accent-foreground">
              <WalletCards size={18} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cycling coaching</p>
              <h1 className="text-xl font-black leading-tight text-foreground">Lesson wallet</h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-accent-foreground">{formatCredits(wallet.summary.availableCredits)}</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">available</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-5 px-5 py-6 md:max-w-4xl">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <WalletMetric icon={WalletCards} label="Available" value={formatCredits(wallet.summary.availableCredits)} />
          <WalletMetric icon={CalendarCheck} label="Booked" value={formatCredits(wallet.summary.bookedCredits)} />
          <WalletMetric icon={CheckCircle2} label="Completed" value={formatCredits(wallet.summary.completedCredits)} />
          <WalletMetric icon={ReceiptText} label="Paid" value={formatCredits(wallet.summary.paidCredits)} />
        </section>

        {loading ? (
          <div className="glass-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading lesson wallet...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <form onSubmit={buyLessons} className="glass-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <CreditCard size={16} className="text-accent-foreground" />
                  <h2 className="text-sm font-black text-foreground">Buy lesson credits</h2>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Lessons</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      step={1}
                      value={lessonCount}
                      onChange={(event) => setLessonCount(Math.max(1, Number(event.target.value) || 1))}
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm font-bold text-foreground outline-none"
                    />
                  </label>
                  <div className="self-end pb-2.5 text-right">
                    <p className="text-lg font-black text-foreground">{formatMoneyCents(packagePricing.totalAmountCents)}</p>
                    <p className="text-[9px] text-muted-foreground">R399 per hour</p>
                  </div>
                </div>
                <label className="mt-3 block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Payment email</span>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                </label>
                <button
                  type="submit"
                  disabled={working === "purchase"}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b35] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {working === "purchase" ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  Pay with PayFast
                </button>
              </form>

              <form onSubmit={bookLesson} className="glass-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <CalendarCheck size={16} className="text-accent-foreground" />
                  <h2 className="text-sm font-black text-foreground">Book a lesson</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Paid package</span>
                    <select
                      value={selectedPurchaseId}
                      onChange={(event) => setPurchaseId(event.target.value)}
                      disabled={paidPurchases.length === 0}
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm font-bold text-foreground outline-none disabled:opacity-50"
                    >
                      {paidPurchases.length === 0 ? (
                        <option value="">No paid package</option>
                      ) : paidPurchases.map((purchase) => (
                        <option key={purchase.id} value={purchase.id}>
                          {formatCredits(purchase.lessonCount)} lessons - {format(new Date(purchase.createdAt), "d MMM yyyy")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 block">
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
                      <option value={30}>30 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                      <option value={120}>120 min</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Location</span>
                    <input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Meet-up point"
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Notes</span>
                    <textarea
                      rows={2}
                      value={clientNotes}
                      onChange={(event) => setClientNotes(event.target.value)}
                      placeholder="What would you like to work on?"
                      className="mt-1 w-full resize-none rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={!selectedPurchaseId || wallet.summary.availableCredits <= 0 || working === "booking"}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff4b35]/45 bg-[#ff4b35]/10 px-4 py-3 text-sm font-black text-accent-foreground disabled:opacity-40"
                >
                  {working === "booking" ? <Loader2 size={15} className="animate-spin" /> : <CalendarCheck size={15} />}
                  Reserve {formatCredits(durationMinutes / 60)} credit
                </button>
              </form>
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Upcoming lessons</h2>
                <span className="text-[10px] font-bold text-accent-foreground">{upcomingSessions.length}</span>
              </div>
              {upcomingSessions.length === 0 ? (
                <EmptyState text="No lessons booked yet." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {upcomingSessions.map((lessonSession) => (
                    <div key={lessonSession.id} className="glass-card p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#ff4b35]/12 text-accent-foreground">
                          <Bike size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-foreground">
                            {format(new Date(lessonSession.startsAt), "EEE, d MMM - HH:mm")}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {lessonSession.durationMinutes} min</span>
                            {lessonSession.location && (
                              <span className="inline-flex items-center gap-1 truncate"><MapPin size={11} /> {lessonSession.location}</span>
                            )}
                          </div>
                          {lessonSession.clientNotes && (
                            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{lessonSession.clientNotes}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          title="Cancel lesson"
                          aria-label="Cancel lesson"
                          onClick={() => cancelLesson(lessonSession.id)}
                          disabled={working === lessonSession.id}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-foreground/10 text-muted-foreground transition-colors hover:border-red-500/35 hover:text-red-500 disabled:opacity-40"
                        >
                          {working === lessonSession.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Packages and payments</h2>
                <span className="text-[10px] font-bold text-muted-foreground">{wallet.purchases.length}</span>
              </div>
              {wallet.purchases.length === 0 ? (
                <EmptyState text="No lesson packages yet." />
              ) : (
                <div className="space-y-2">
                  {wallet.purchases.map((purchase) => (
                    <div key={purchase.id} className="glass-card flex items-center gap-3 p-4">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-muted-foreground">
                        <ReceiptText size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-foreground">
                          {formatCredits(purchase.lessonCount)} lessons
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {formatMoneyCents(purchase.totalAmountCents, purchase.currency)}
                          {purchase.xeroInvoiceNumber ? ` - ${purchase.xeroInvoiceNumber}` : ""}
                          {` - ${format(new Date(purchase.createdAt), "d MMM yyyy")}`}
                        </p>
                      </div>
                      {purchase.status === "pending_payment" && purchase.payfastCheckoutUrl ? (
                        <a
                          href={purchase.payfastCheckoutUrl}
                          className="rounded-lg bg-[#ff4b35] px-3 py-2 text-[10px] font-black text-white"
                        >
                          Pay
                        </a>
                      ) : (
                        <StatusPill status={purchase.status} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Coached Strava rides</h2>
                <span className="text-[10px] font-bold text-accent-foreground">{wallet.lessonRides.length}</span>
              </div>
              {wallet.lessonRides.length === 0 ? (
                <EmptyState text="No Strava rides have been attributed to lessons yet." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {wallet.lessonRides.map((ride) => (
                    <div key={ride.id} className="glass-card flex items-center gap-3 p-4">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                        <Bike size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-foreground">{ride.name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {format(new Date(ride.date), "d MMM yyyy")} · {(Number(ride.distance) / 1000).toFixed(1)} km · {Math.round(Number(ride.elevation_gain))} m climbing
                        </p>
                        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600">Coached lesson ride</p>
                      </div>
                      <a href={`https://www.strava.com/activities/${encodeURIComponent(ride.strava_id)}`} target="_blank" rel="noopener noreferrer"
                        aria-label="View activity on Strava" className="text-muted-foreground">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {history.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Lesson history</h2>
                  <span className="text-[10px] font-bold text-muted-foreground">{history.length}</span>
                </div>
                <div className="space-y-2">
                  {history.slice(0, 12).map((lessonSession) => (
                    <div key={lessonSession.id} className="glass-card flex items-center gap-3 p-4">
                      <CheckCircle2 size={16} className={lessonSession.status === "completed" ? "text-emerald-500" : "text-muted-foreground"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">{format(new Date(lessonSession.startsAt), "d MMM yyyy - HH:mm")}</p>
                        <p className="text-[10px] capitalize text-muted-foreground">{lessonSession.status.replace("_", " ")}</p>
                      </div>
                      <p className="text-xs font-black text-muted-foreground">{formatCredits(lessonSession.creditAmount)}</p>
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

function WalletMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-card p-3 text-center">
      <div className="mb-1 flex justify-center"><Icon size={14} className="text-accent-foreground" /></div>
      <p className="text-xl font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: LessonPurchase["status"] }) {
  const active = status === "paid";
  return (
    <span
      className="rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
      style={{
        color: active ? "#16a34a" : "var(--muted-foreground)",
        borderColor: active ? "rgba(22,163,74,0.35)" : "var(--border)",
        background: active ? "rgba(22,163,74,0.10)" : "var(--fill-soft)",
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="glass-card p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
