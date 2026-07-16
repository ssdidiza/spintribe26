"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Minus,
  Plus,
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

const CART_MAX_PER_LINE = 10;

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
  // One quantity per service. 1 session total = pick-a-slot-then-pay (the
  // classic flow); 2+ = pay first, schedule each session from /schedule.
  const [cart, setCart] = useState<Record<string, number>>({});
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
  const [step, setStep] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "cancelled") {
        setNotice("Payment cancelled - nothing was charged. You can book again any time.");
      }

      try {
        const response = await fetch("/api/lessons/services");
        const data = (await response.json().catch(() => ({}))) as { services?: LessonService[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load services");
        if (cancelled) return;

        const list = data.services ?? [];
        const requestedPackage = COACHING_PACKAGE_TIERS.find((tier) => tier.id === params.get("package"));
        setServices(list);
        if (requestedPackage) {
          setPackageTierId(requestedPackage.id);
          setAvailabilityLoading(Boolean(findPerformanceService(list)));
        } else if (list[0]) {
          const requestedSession = params.get("session");
          const requestedService = requestedSession === "performance" ? findPerformanceService(list) : list[0];
          setCart({ [(requestedService ?? list[0]).id]: 1 });
          setAvailabilityLoading(true);
        }

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

  const selectedPackage = useMemo(
    () => COACHING_PACKAGE_TIERS.find((tier) => tier.id === packageTierId) ?? null,
    [packageTierId]
  );
  const cartLines = useMemo(
    () =>
      services
        .map((service) => ({ service, quantity: cart[service.id] ?? 0 }))
        .filter((line) => line.quantity > 0),
    [services, cart]
  );
  const totalQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotalCents = cartLines.reduce((sum, line) => sum + line.quantity * line.service.priceCents, 0);
  const singleService = !selectedPackage && totalQuantity === 1 ? cartLines[0]?.service ?? null : null;
  const needsSlot = Boolean(selectedPackage || singleService);
  // The service whose availability drives the slot picker.
  const slotServiceId = selectedPackage ? findPerformanceService(services)?.id ?? "" : singleService?.id ?? "";
  const slotDurationMinutes = selectedPackage?.durationMinutes ?? singleService?.durationMinutes ?? 0;

  useEffect(() => {
    if (!slotServiceId || !needsSlot) return;
    const controller = new AbortController();
    let cancelled = false;
    const timeoutId = window.setTimeout(() => controller.abort("availability_timeout"), 15_000);
    (async () => {
      try {
        const params = new URLSearchParams({ serviceId: slotServiceId });
        if (slotDurationMinutes) params.set("durationMinutes", String(slotDurationMinutes));
        const response = await fetch(`/api/lessons/availability?${params}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          availability?: LessonAvailabilityDay[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Unable to load available times");
        setAvailability(data.availability ?? []);
      } catch (loadError) {
        if (controller.signal.aborted) {
          if (!cancelled) setError("Lesson times are taking longer than expected. Please choose the session again to retry.");
          return;
        }
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load available times");
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setAvailabilityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [slotServiceId, slotDurationMinutes, needsSlot]);

  function setQuantity(serviceId: string, quantity: number) {
    const next = Math.max(0, Math.min(CART_MAX_PER_LINE, quantity));
    setCart((current) => ({ ...current, [serviceId]: next }));
    setPackageTierId("");
    setStartsAt("");
    setAvailability([]);
    setAvailabilityLoading(true);
    setError("");
    setStep(1);
  }

  function choosePackage(tier: CoachingPackageTier) {
    if (!findPerformanceService(services)) return;
    setCart({});
    setPackageTierId(tier.id);
    setStartsAt("");
    setAvailability([]);
    setAvailabilityLoading(true);
    setError("");
    setStep(1);
  }

  const selectedOffer = selectedPackage
    ? {
        name: selectedPackage.name,
        priceCents: selectedPackage.totalPriceCents,
        currency: selectedPackage.currency,
      }
    : totalQuantity > 0
      ? {
          name: cartLines.map((line) => `${line.quantity}x ${line.service.name}`).join(" + "),
          priceCents: cartTotalCents,
          currency: cartLines[0]?.service.currency ?? "ZAR",
        }
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        location,
        notes,
      };
      if (selectedPackage) {
        payload.packageTierId = selectedPackage.id;
        payload.serviceId = findPerformanceService(services)?.id ?? "";
        payload.startsAt = startsAt;
      } else {
        payload.items = cartLines.map((line) => ({ serviceId: line.service.id, quantity: line.quantity }));
        if (singleService) payload.startsAt = startsAt;
      }
      const response = await fetch("/api/lessons/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const canSubmit = selectedPackage ? Boolean(startsAt) : totalQuantity > 0 && (!singleService || Boolean(startsAt));
  const detailsComplete = Boolean(
    name.trim() && /\S+@\S+\.\S+/.test(email.trim()) && phone.replace(/\D/g, "").length >= 9
  );
  const stepLabels = ["Choose", "Pick time", "Your details", "Review"];

  function continueFromOffer() {
    if (!selectedOffer) return;
    setStep(needsSlot ? 2 : 3);
    setError("");
  }

  function goBack() {
    setError("");
    setStep((current) => {
      if (current === 3 && !needsSlot) return 1;
      return Math.max(1, current - 1);
    });
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
            Build the right coaching session in four quick steps.
          </p>
          <div className="grid grid-cols-4 gap-2 text-[10px] font-bold text-muted-foreground">
            {stepLabels.map((label, index) => (
              <div
                key={label}
                aria-current={step === index + 1 ? "step" : undefined}
                className={`rounded-lg border px-2 py-2 text-center transition-colors md:px-3 ${
                  step === index + 1
                    ? "border-[#ff4b35]/50 bg-[#ff4b35]/10 text-foreground"
                    : step > index + 1
                      ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-600"
                      : "border-foreground/10 bg-foreground/[0.03]"
                }`}
              >
                <span className="mr-1 text-accent-foreground">{index + 1}.</span>
                <span className="hidden sm:inline">{label}</span>
              </div>
            ))}
          </div>
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
            {step === 1 && <section className="space-y-3">
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  1. Choose your sessions
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Set how many of each session you want — mix types in one checkout. Performance Blocks give you a
                  structured progression at a lower per-session rate.
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {services.map((service) => {
                  const quantity = selectedPackage ? 0 : cart[service.id] ?? 0;
                  const active = quantity > 0;
                  return (
                    <div
                      key={service.id}
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
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock3 size={11} /> {service.durationMinutes} min
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Fewer ${service.name}`}
                              onClick={() => setQuantity(service.id, quantity - 1)}
                              disabled={quantity === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-foreground/10 text-muted-foreground disabled:opacity-40"
                            >
                              <Minus size={13} />
                            </button>
                            <span className={`w-7 text-center text-sm font-black ${active ? "text-accent-foreground" : "text-muted-foreground"}`}>
                              {quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`More ${service.name}`}
                              onClick={() => setQuantity(service.id, quantity + 1)}
                              disabled={quantity >= CART_MAX_PER_LINE}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-foreground/10 text-foreground disabled:opacity-40"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
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
                  This checkout books the first {selectedPackage.durationMinutes}-minute block session now. You&apos;ll
                  get a personal scheduling link for the remaining {selectedPackage.sessions - 1} sessions the moment
                  payment is confirmed.
                </p>
              )}
              {!selectedPackage && totalQuantity > 1 && (
                <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                  You&apos;re booking {totalQuantity} sessions in one payment. After PayFast confirms, you&apos;ll get a
                  personal scheduling link (email + WhatsApp) to pick a time for each session.
                </p>
              )}
              <button
                type="button"
                onClick={continueFromOffer}
                disabled={!selectedOffer}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
              >
                Continue <ArrowRight size={16} />
              </button>
            </section>}

            {step === 2 && needsSlot && (
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
                <div className="flex items-center gap-3 pt-2">
                  <button type="button" onClick={goBack} className="inline-flex items-center gap-1 px-2 py-3 text-xs font-bold text-muted-foreground">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={!startsAt}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </section>
            )}

            {step === 3 && <section className="glass-card space-y-4 p-5">
              <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                {needsSlot ? "3." : "2."} Rider details
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
              <div className="flex items-center gap-3 pt-1">
                <button type="button" onClick={goBack} className="inline-flex items-center gap-1 px-2 py-3 text-xs font-bold text-muted-foreground">
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={!detailsComplete}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
                >
                  Review booking <ArrowRight size={16} />
                </button>
              </div>
            </section>}

            {step === 4 && selectedOffer && (
              <section className="space-y-4">
                <div className="glass-card space-y-4 p-5">
                  <div>
                    <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">4. Review your booking</h2>
                    <p className="mt-1 text-lg font-black text-foreground">{selectedOffer.name}</p>
                  </div>
                  <div className="grid gap-3 border-y border-foreground/10 py-4 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rider</p>
                      <p className="mt-1 font-bold text-foreground">{name}</p>
                      <p className="text-muted-foreground">{email}</p>
                      <p className="text-muted-foreground">{phone}</p>
                    </div>
                    {startsAt && (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">First session</p>
                        <p className="mt-1 font-bold text-foreground">
                          {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(startsAt))}
                        </p>
                        {location && <p className="text-muted-foreground">{location}</p>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-2xl font-black text-accent-foreground">
                      {formatMoneyCents(selectedOffer.priceCents, selectedOffer.currency)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={goBack} className="inline-flex items-center gap-1 px-2 py-3 text-xs font-bold text-muted-foreground">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button type="submit" disabled={working || !canSubmit || !detailsComplete}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
                    {working ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
                    Pay {formatMoneyCents(selectedOffer.priceCents, selectedOffer.currency)} securely
                  </button>
                </div>
                <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
                  <ShieldCheck size={12} /> Secure online checkout.
                  <MapPin size={12} /> Johannesburg area.
                  <CheckCircle2 size={12} /> Calendar invite after checkout.
                </p>
              </section>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
