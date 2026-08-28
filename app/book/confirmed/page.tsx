"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, CheckCircle2, Clock3, Loader2, MapPin, Sparkles } from "lucide-react";
import {
  COACHING_PACKAGE_TIERS,
  coachingPackageDiscountPercent,
  coachingPackageSavingsCents,
} from "@/lib/coaching-packages";

type BookingStatus = {
  status: string;
  confirmed: boolean;
  kind?: string;
  service: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  startsAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  lessonCount: number;
  totalAmountCents: number;
  currency: string;
  discountAmountCents: number;
  remainingSessions?: number;
  scheduleToken?: string | null;
};

function formatWhen(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function formatMoneyCents(cents: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 0 }).format(cents / 100);
}

export default function BookingConfirmedPage() {
  // useSearchParams needs a Suspense boundary on statically prerendered pages.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BookingConfirmedContent />
    </Suspense>
  );
}

function BookingConfirmedContent() {
  const [data, setData] = useState<BookingStatus | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  // Bumping this restarts the polling loop ("Check again").
  const [pollRun, setPollRun] = useState(0);
  const reference = useSearchParams().get("reference") ?? "";

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const bookingReference = reference;

    async function poll() {
      if (!bookingReference) {
        setError("Missing booking reference.");
        setPending(false);
        return;
      }
      attempts += 1;
      try {
        const response = await fetch(`/api/lessons/book/status?reference=${encodeURIComponent(bookingReference)}`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as BookingStatus & { error?: string };
        if (!response.ok) throw new Error(body.error || "Unable to load booking");
        if (cancelled) return;
        setData(body);
        if (body.confirmed) {
          setPending(false);
          return;
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Unable to load booking");
      }
      // PayFast ITNs usually land in seconds but can retry for minutes —
      // poll for ~2 minutes before handing over to the "Check again" button.
      if (!cancelled && attempts < 40) {
        window.setTimeout(poll, 3000);
      } else if (!cancelled) {
        setPending(false);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [reference, pollRun]);

  const fourSessionBlock = COACHING_PACKAGE_TIERS[0];
  const remainingSessions = data?.remainingSessions ?? 0;
  const scheduleUrl = data?.scheduleToken ? `/schedule?token=${encodeURIComponent(data.scheduleToken)}` : "";
  const showUpsell = Boolean(data?.confirmed && data.lessonCount <= 1 && remainingSessions === 0);
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        {pending && !data?.confirmed ? (
          <div className="glass-card flex flex-col items-center gap-3 p-8">
            <Loader2 size={28} className="animate-spin text-accent-foreground" />
            <p className="text-sm font-bold text-foreground">Confirming your PayFast payment...</p>
            <p className="text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        ) : data?.confirmed ? (
          <div className="w-full space-y-3">
            <div className="glass-card flex flex-col items-center gap-3 p-8">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">SpinTribe Coaching</p>
              <h1 className="text-xl font-black text-foreground">
                {data.kind === "cart" ? "Payment received!" : "You're booked!"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {data.customerName ? `${data.customerName}, your ` : "Your "}
                <span className="font-bold text-foreground">{data.service}</span> is confirmed.
              </p>
              {data.startsAt && (
                <div className="mt-1 space-y-1 text-sm">
                  <p className="inline-flex items-center gap-1.5 font-bold text-foreground">
                    <Clock3 size={14} /> {formatWhen(data.startsAt)}
                  </p>
                  {data.location && (
                    <p className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <MapPin size={14} /> {data.location}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-3 grid w-full gap-2">
                {scheduleUrl && remainingSessions > 0 && (
                  <Link
                    href={scheduleUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3 text-xs font-black text-white"
                  >
                    <CalendarPlus size={14} /> Schedule your {remainingSessions} session{remainingSessions === 1 ? "" : "s"}
                  </Link>
                )}
                {reference && data.startsAt && (
                  <>
                    <a
                      href={`/api/lessons/book/calendar?reference=${encodeURIComponent(reference)}&provider=google`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#ff4b35]/40 px-4 py-3 text-xs font-black text-accent-foreground"
                    >
                      <CalendarPlus size={14} /> Add to Google Calendar
                    </a>
                    <a
                      href={`/api/lessons/book/calendar?reference=${encodeURIComponent(reference)}`}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/10 px-4 py-3 text-xs font-black text-muted-foreground"
                    >
                      <CalendarPlus size={14} /> Download calendar file
                    </a>
                  </>
                )}
                <a
                  href="/api/auth/strava"
                  className="inline-flex items-center justify-center rounded-lg border border-foreground/10 px-4 py-3 text-xs font-black text-muted-foreground"
                >
                  Link to a SpinTribe account
                </a>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {remainingSessions > 0
                  ? "Your scheduling link is also in your email — keep it, it works for every session in this package."
                  : "The confirmation email includes a calendar invite with reminders for the day before and two hours before."}
              </p>
            </div>

            {showUpsell && (
              <div className="glass-card p-5 text-left">
                <div className="mb-3 flex items-start gap-2">
                  <Sparkles size={16} className="mt-0.5 flex-shrink-0 text-accent-foreground" />
                  <div>
                    <p className="text-sm font-black text-foreground">Turn this into a Performance Block</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      A structured block gives the coach enough continuity to plan FTP-based progression instead of
                      treating each ride as a one-off. Add the 4-session block using the same details.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-foreground/[0.04] p-3 text-xs text-muted-foreground">
                  Book the block for{" "}
                  <span className="font-black text-foreground">{formatMoneyCents(fourSessionBlock.totalPriceCents, fourSessionBlock.currency)}</span>{" "}
                  and save {formatMoneyCents(coachingPackageSavingsCents(fourSessionBlock), fourSessionBlock.currency)} (
                  {coachingPackageDiscountPercent(fourSessionBlock)}%) versus four single Skills &amp; Training Rides.
                </div>
                {reference && (
                  <Link
                    href={`/book?package=${encodeURIComponent(fourSessionBlock.id)}&from=${encodeURIComponent(reference)}`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff4b35] px-4 py-3 text-xs font-black text-white"
                  >
                    <Sparkles size={14} /> Book the block
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card flex flex-col items-center gap-3 p-8">
            <Clock3 size={32} className="text-amber-500" />
            <h1 className="text-lg font-black text-foreground">Almost there</h1>
            <p className="text-sm text-muted-foreground">
              {error || "PayFast is still confirming your payment. Your booking will be confirmed by email shortly."}
            </p>
            <button
              type="button"
              onClick={() => {
                setPending(true);
                setError("");
                setPollRun((run) => run + 1);
              }}
              className="mt-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground"
            >
              Check again
            </button>
          </div>
        )}

        <Link href="/book" className="mt-6 text-xs font-bold text-accent-foreground">
          Book another session
        </Link>
      </main>
    </div>
  );
}
