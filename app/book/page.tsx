"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bike,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import LessonSlotCalendar, { LessonAvailabilityDay } from "@/components/LessonSlotCalendar";
import {
  COACHING_PACKAGE_TIERS,
  CoachingPackageTier,
  coachingPackageDiscountPercent,
  coachingPackageSavingsCents,
} from "@/lib/coaching-packages";

type LessonService = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

type BookingStatus = {
  confirmed?: boolean;
  customerName?: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  location?: string | null;
};

function formatMoneyCents(cents: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 0 }).format(cents / 100);
}

function findPerformanceService(list: LessonService[]) {
  return (
    list.find((service) => service.slug === "skills-90") ||
    list.find((service) => service.name.toLowerCase().includes("skills")) ||
    list.find((service) => service.durationMinutes >= 90) ||
    list[1] ||
    list[0] ||
    null
  );
}

export default function BookPage() {
  const [services, setServices] = useState<LessonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceId, setServiceId] = useState("");
  const [packageTierId, setPackageTierId] = useState<CoachingPackageTier["id"] | "">("");
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
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "cancelled") {
        setNotice("Payment cancelled - nothing was charged. You can book again any time.");
      }

      try {
        const response = await fetch("/api/lessons/services", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { services?: LessonService[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load services");
        if (cancelled) return;

        const list = data.services ?? [];
        const requestedPackage = COACHING_PACKAGE_TIERS.find((tier) => tier.id === params.get("package"));
        const initialService = requestedPackage ? findPerformanceService(list) : list[0] ?? null;
        setServices(list);
        setServiceId((current) => current || initialService?.id || "");
        setPackageTierId(requestedPackage?.id ?? "");
        setAvailabilityLoading(Boolean(initialService));

        const fromReference = params.get("from");
        if (fromReference) {
          const statusResponse = await fetch(
            `/api/lessons/book/status?reference=${encodeURIComponent(fromReference)}`,
            { cache: "no-store" }
          );
          const status = (await statusResponse.json().catch(() => ({}))) as BookingStatus & { error?: string };
          if (!cancelled && statusResponse.ok && status.confirmed) {
            setName(status.customerName ?? "");
            setEmail(status.customerEmail ?? "");
            setPhone(status.customerPhone ?? "");
            setLocation(status.location ?? "");
            setNotice("Details copied from your confirmed session. Choose a block slot and continue with PayFast.");
          }
        }
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
    setPackageTierId("");
    setStartsAt("");
    setAvailability([]);
    setAvailabilityLoading(true);
    setError("");
  }

  function choosePackage(tier: CoachingPackageTier) {
    const baseService = findPerformanceService(services);
    if (!baseService) return;
    setServiceId(baseService.id);
    setPackageTierId(tier.id);
    setStartsAt("");
    setAvailability([]);
    setAvailabilityLoading(true);
    setError("");
  }

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [services, serviceId]
  );
  const selectedPackage = useMemo(
    () => COACHING_PACKAGE_TIERS.find((tier) => tier.id === packageTierId) ?? null,
    [packageTierId]
  );
  const selectedOffer = selectedPackage
    ? {
        name: selectedPackage.name,
        priceCents: selectedPackage.totalPriceCents,
        currency: selectedPackage.currency,
        durationMinutes: selectedPackage.durationMinutes,
      }
    : selectedService;

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
          packageTierId: selectedPackage?.id,
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
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 md:max-w-3xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ff4b35]/12 text-accent-foreground">
            <Bike size={18} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">SpinTribe Coaching</p>
            <h1 className="text-xl font-black leading-tight text-foreground">Book cycling coaching</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-5 px-5 py-6 md:max-w-3xl">
        <section className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            One-on-one cycling coaching in Johannesburg: start with a single session, or commit to a structured
            Performance Block with a better per-session rate.
          </p>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-muted-foreground md:grid-cols-4">
            {["Choose", "Pick time", "Add details", "PayFast"].map((step, index) => (
              <div key={step} className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
                <span className="mr-1 text-accent-foreground">{index + 1}.</span>
                {step}
              </div>
            ))}
          </div>
          <p className="rounded-lg border border-foreground/10 bg-foreground/[0.035] px-4 py-3 text-[11px] text-muted-foreground">
            Strava sign-in is optional and only links the lesson to your own SpinTribe history. Booking, payment,
            calendar invites, and reminders use the details you enter here.
          </p>
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="glass-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading coaching options...
          </div>
        ) : services.length === 0 ? (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">
            No coaching sessions are available right now. Please check back soon.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <section className="space-y-3">
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  1. Choose a session or block
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Single sessions are the entry point. Performance Blocks give you a structured progression after that first ride.
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {services.map((service) => {
                  const active = !selectedPackage && service.id === serviceId;
                  return (
                    <button
                      type="button"
                      key={service.id}
                      onClick={() => chooseService(service.id)}
                      className={`glass-card flex min-h-36 items-start gap-3 p-4 text-left transition-colors ${
                        active ? "ring-2 ring-[#ff4b35]" : ""
                      }`}
                    >
                      <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${active ? "bg-[#ff4b35]/15 text-accent-foreground" : "bg-foreground/[0.05] text-muted-foreground"}`}>
                        <Bike size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-black text-foreground">{service.name}</p>
                          <p className="text-sm font-black text-accent-foreground">{formatMoneyCents(service.priceCents, service.currency)}</p>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{service.description}</p>
                        <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock3 size={11} /> {service.durationMinutes} min
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {COACHING_PACKAGE_TIERS.map((tier) => {
                  const active = selectedPackage?.id === tier.id;
                  const savings = coachingPackageSavingsCents(tier);
                  return (
                    <button
                      type="button"
                      key={tier.id}
                      onClick={() => choosePackage(tier)}
                      disabled={!findPerformanceService(services)}
                      className={`glass-card flex min-h-44 items-start gap-3 p-4 text-left transition-colors disabled:opacity-50 ${
                        active ? "ring-2 ring-[#ff4b35]" : ""
                      }`}
                    >
                      <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${active ? "bg-[#ff4b35]/15 text-accent-foreground" : "bg-foreground/[0.05] text-muted-foreground"}`}>
                        <Sparkles size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-foreground">{tier.name}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                              Save {formatMoneyCents(savings, tier.currency)} ({coachingPackageDiscountPercent(tier)}%)
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-accent-foreground">
                              {formatMoneyCents(tier.totalPriceCents, tier.currency)}
                            </p>
                            <p className="text-[10px] text-muted-foreground line-through">
                              {formatMoneyCents(tier.compareAtCents, tier.currency)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{tier.description}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{tier.position}</p>
                        <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <ReceiptText size={11} /> {tier.sessions} x {tier.durationMinutes} min
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedPackage && (
                <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                  This checkout books the first {selectedPackage.durationMinutes}-minute block session now. The remaining{" "}
                  {selectedPackage.sessions - 1} sessions are captured on the paid Performance Block for follow-up scheduling.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                2. Choose an available time
              </h2>
              <LessonSlotCalendar
                availability={availability}
                selectedSlot={startsAt}
                onSelect={setStartsAt}
                loading={availabilityLoading}
              />
            </section>

            <section className="glass-card space-y-3 p-5">
              <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                3. Rider details
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Name</span>
                  <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name"
                    className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Email</span>
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"
                    className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp</span>
                  <input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="071 234 5678"
                    className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Preferred meeting point</span>
                  <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Parkrun car park, Delta Park"
                    className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Goals for this session or block</span>
                  <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Tell the coach about your experience, event goal, FTP target, confidence gap, or skills focus"
                    className="mt-1 w-full resize-none rounded-lg border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60" />
                </label>
              </div>
            </section>

            <button type="submit" disabled={working || !serviceId || !startsAt}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
              {working ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
              {selectedOffer ? `Pay ${formatMoneyCents(selectedOffer.priceCents, selectedOffer.currency)} with PayFast` : "Book"}
            </button>
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
              <ShieldCheck size={12} /> Secure payment via PayFast.
              <MapPin size={12} /> Johannesburg area.
              <CheckCircle2 size={12} /> Calendar invite after checkout.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
