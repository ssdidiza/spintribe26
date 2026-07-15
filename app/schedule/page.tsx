"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bike, CalendarCheck, CheckCircle2, Clock3, Loader2, MapPin } from "lucide-react";
import LessonSlotCalendar, { LessonAvailabilityDay } from "@/components/LessonSlotCalendar";

type ScheduleItem = {
  id: string;
  serviceId: string | null;
  name: string;
  durationMinutes: number;
  quantity: number;
  quantityRemaining: number;
};

type ScheduleSession = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  location: string;
  itemName: string | null;
};

type ScheduleData = {
  paid: boolean;
  status: string;
  customerName: string;
  description: string;
  location: string;
  items: ScheduleItem[];
  sessions: ScheduleSession[];
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

export default function SchedulePage() {
  // useSearchParams needs a Suspense boundary on statically prerendered pages.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ScheduleContent />
    </Suspense>
  );
}

function ScheduleContent() {
  const token = useSearchParams().get("token") ?? "";
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemId, setItemId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [availability, setAvailability] = useState<LessonAvailabilityDay[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [booked, setBooked] = useState<{ startsAt: string; itemName: string } | null>(null);
  // Bumped after each booking so the slot picker drops the slot just taken.
  const [availabilityRun, setAvailabilityRun] = useState(0);

  const missingToken = !token;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/lessons/schedule?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as ScheduleData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load your schedule");
      setData(body);
      setLocation((current) => current || body.location || "");
      setItemId((current) => {
        if (current && body.items.some((item) => item.id === current && item.quantityRemaining > 0)) return current;
        return body.items.find((item) => item.quantityRemaining > 0)?.id ?? "";
      });
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your schedule");
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // setTimeout(0) keeps setState out of the synchronous effect body,
    // matching the loader pattern in app/admin/page.tsx.
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedItem = useMemo(
    () => data?.items.find((item) => item.id === itemId) ?? null,
    [data, itemId]
  );
  const remainingTotal = useMemo(
    () => (data?.items ?? []).reduce((sum, item) => sum + item.quantityRemaining, 0),
    [data]
  );
  const upcoming = useMemo(
    () => (data?.sessions ?? []).filter((session) => session.status === "booked" || session.status === "pending_payment"),
    [data]
  );

  useEffect(() => {
    if (!selectedItem) return;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          token,
          itemId: selectedItem.id,
        });
        const response = await fetch(`/api/lessons/schedule?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as {
          availability?: LessonAvailabilityDay[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Unable to load available times");
        setAvailability(body.availability ?? []);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load available times");
      } finally {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selectedItem, token, availabilityRun]);

  async function book() {
    if (!selectedItem || !startsAt) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/lessons/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, itemId: selectedItem.id, startsAt, location, notes }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to book that slot");
      setBooked({ startsAt, itemName: selectedItem.name });
      setStartsAt("");
      setNotes("");
      setAvailability([]);
      setAvailabilityLoading(true);
      setAvailabilityRun((run) => run + 1);
      await load();
    } catch (bookError) {
      setError(bookError instanceof Error ? bookError.message : "Unable to book that slot");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 md:max-w-3xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ff4b35]/12 text-accent-foreground">
            <Bike size={18} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">SpinTribe Coaching</p>
            <h1 className="text-xl font-black leading-tight text-foreground">Schedule your sessions</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-5 px-5 py-6 md:max-w-3xl">
        {missingToken && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300">
            This schedule link is missing its token. Please use the link from your email or WhatsApp.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}
        {booked && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <CheckCircle2 size={14} /> {booked.itemName} booked for {formatWhen(booked.startsAt)}.
            </span>{" "}
            Calendar invite and WhatsApp confirmation are on their way.
          </div>
        )}

        {missingToken ? null : loading ? (
          <div className="glass-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading your sessions...
          </div>
        ) : !data ? null : !data.paid ? (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">
            This purchase hasn&apos;t been confirmed as paid yet. If you just paid, give it a minute and refresh.
          </div>
        ) : (
          <>
            <section className="glass-card space-y-1 p-5">
              <p className="text-sm font-black text-foreground">
                {data.customerName ? `${data.customerName}, you` : "You"} have{" "}
                <span className="text-accent-foreground">
                  {remainingTotal} session{remainingTotal === 1 ? "" : "s"}
                </span>{" "}
                left to schedule.
              </p>
              <p className="text-xs text-muted-foreground">{data.description}</p>
            </section>

            {remainingTotal > 0 && (
              <>
                {data.items.filter((item) => item.quantityRemaining > 0).length > 1 && (
                  <section className="space-y-2">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                      1. Which session?
                    </h2>
                    <div className="grid gap-2 md:grid-cols-2">
                      {data.items
                        .filter((item) => item.quantityRemaining > 0)
                        .map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => {
                              setItemId(item.id);
                              setStartsAt("");
                              setAvailability([]);
                              setAvailabilityLoading(true);
                            }}
                            className={`glass-card flex items-center justify-between gap-3 p-4 text-left transition-colors ${
                              item.id === itemId ? "ring-2 ring-[#ff4b35]" : ""
                            }`}
                          >
                            <div>
                              <p className="text-sm font-black text-foreground">{item.name}</p>
                              <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock3 size={11} /> {item.durationMinutes} min
                              </p>
                            </div>
                            <span className="rounded-full bg-[#ff4b35]/10 px-2.5 py-1 text-[10px] font-black text-accent-foreground">
                              {item.quantityRemaining} left
                            </span>
                          </button>
                        ))}
                    </div>
                  </section>
                )}

                <section className="space-y-2">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    {data.items.filter((item) => item.quantityRemaining > 0).length > 1 ? "2. " : ""}
                    Choose an available time
                    {selectedItem ? ` — ${selectedItem.name}` : ""}
                  </h2>
                  <LessonSlotCalendar
                    availability={availability}
                    selectedSlot={startsAt}
                    onSelect={setStartsAt}
                    loading={availabilityLoading}
                  />
                </section>

                <section className="glass-card space-y-3 p-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Meeting point</span>
                      <input
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="e.g. Parkrun car park, Delta Park"
                        className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Notes for the coach (optional)</span>
                      <input
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Focus for this session"
                        className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void book()}
                    disabled={working || !selectedItem || !startsAt}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    {working ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
                    Book this session
                  </button>
                </section>
              </>
            )}

            {upcoming.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  Your booked sessions
                </h2>
                <div className="space-y-2">
                  {upcoming.map((session) => (
                    <div key={session.id} className="glass-card flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-bold text-foreground">{formatWhen(session.startsAt)}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {session.itemName || "Coaching session"} · {session.durationMinutes} min
                          {session.location ? (
                            <span className="ml-1 inline-flex items-center gap-0.5">
                              <MapPin size={10} /> {session.location}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-500" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {remainingTotal === 0 && upcoming.length === 0 && (
              <div className="glass-card p-8 text-center text-sm text-muted-foreground">
                All sessions on this package have been scheduled and completed. Thank you for riding with us.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
