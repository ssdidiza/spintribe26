"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bike, CalendarCheck, Clock3, Loader2, MapPin, ShieldCheck } from "lucide-react";
import LessonSlotCalendar, { LessonAvailabilityDay } from "@/components/LessonSlotCalendar";

type LessonService = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

function formatMoneyCents(cents: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 0 }).format(cents / 100);
}

export default function BookPage() {
  const [services, setServices] = useState<LessonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [availability, setAvailability] = useState<LessonAvailabilityDay[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (new URLSearchParams(window.location.search).get("payment") === "cancelled") {
        setNotice("Payment cancelled — nothing was charged. You can book again any time.");
      }
      try {
        const response = await fetch("/api/lessons/services", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { services?: LessonService[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load services");
        if (cancelled) return;
        const list = data.services ?? [];
        setServices(list);
        setServiceId((current) => current || list[0]?.id || "");
        setAvailabilityLoading(Boolean(list.length));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load services");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/lessons/availability?serviceId=${encodeURIComponent(serviceId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          availability?: LessonAvailabilityDay[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Unable to load available times");
        setAvailability(data.availability ?? []);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load available times");
      } finally {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      }
    })();
    return () => controller.abort();
  }, [serviceId]);

  function chooseService(id: string) {
    setServiceId(id);
    setStartsAt("");
    setAvailability([]);
    setAvailabilityLoading(true);
    setError("");
  }

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [services, serviceId]
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/lessons/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          startsAt,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          location,
          notes,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { authorizationUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to start booking");
      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      throw new Error("Payment could not be started");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to start booking");
      setWorking(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header px-5 py-4">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 md:max-w-2xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff4b35]/12 text-accent-foreground">
            <Bike size={18} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">spera coaching</p>
            <h1 className="text-xl font-black leading-tight text-foreground">Book a cycling lesson</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-5 px-5 py-6 md:max-w-2xl">
        <p className="text-sm text-muted-foreground">
          One-on-one coaching for beginners and riders levelling up. Pick a session, choose a time, and pay securely —
          no account needed.
        </p>
        <p className="rounded-xl border border-foreground/10 bg-foreground/[0.035] px-4 py-3 text-[11px] text-muted-foreground">
          Already use SpinTribe? Sign in with Strava before booking and the lesson will also appear in your lesson history.
        </p>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="glass-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading sessions...
          </div>
        ) : services.length === 0 ? (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">
            No sessions are available right now. Please check back soon.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <section className="space-y-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Choose a session</h2>
              <div className="grid gap-2">
                {services.map((service) => {
                  const active = service.id === serviceId;
                  return (
                    <button
                      type="button"
                      key={service.id}
                      onClick={() => chooseService(service.id)}
                      className={`glass-card flex items-start gap-3 p-4 text-left transition-colors ${
                        active ? "ring-2 ring-[#ff4b35]" : ""
                      }`}
                    >
                      <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#ff4b35]/15 text-accent-foreground" : "bg-foreground/[0.05] text-muted-foreground"}`}>
                        <Bike size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-black text-foreground">{service.name}</p>
                          <p className="text-sm font-black text-accent-foreground">{formatMoneyCents(service.priceCents, service.currency)}</p>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{service.description}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock3 size={11} /> {service.durationMinutes} min
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Choose an available time</h2>
              <LessonSlotCalendar
                availability={availability}
                selectedSlot={startsAt}
                onSelect={setStartsAt}
                loading={availabilityLoading}
              />
            </section>

            <section className="glass-card space-y-3 p-5">
              <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Your details</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Name</span>
                  <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name"
                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Email</span>
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"
                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Phone (WhatsApp)</span>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="071 234 5678"
                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Preferred meeting point (optional)</span>
                  <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Parkrun car park, Delta Park"
                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">What would you like to work on? (optional)</span>
                  <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Tell the coach about your experience and goals"
                    className="mt-1 w-full resize-none rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
              </div>
            </section>

            <button type="submit" disabled={working || !serviceId || !startsAt}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
              {working ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
              {selectedService ? `Pay ${formatMoneyCents(selectedService.priceCents, selectedService.currency)} & book` : "Book"}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldCheck size={12} /> Secure payment via PayFast. <MapPin size={12} /> Johannesburg area.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
