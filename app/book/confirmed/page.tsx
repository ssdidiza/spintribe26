"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Loader2, MapPin } from "lucide-react";

type BookingStatus = {
  status: string;
  confirmed: boolean;
  service: string;
  customerName: string;
  startsAt: string | null;
  durationMinutes: number | null;
  location: string | null;
};

function formatWhen(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function BookingConfirmedPage() {
  const [data, setData] = useState<BookingStatus | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const reference = new URLSearchParams(window.location.search).get("reference");

    async function poll() {
      if (!reference) {
        setError("Missing booking reference.");
        setPending(false);
        return;
      }
      attempts += 1;
      try {
        const response = await fetch(`/api/lessons/book/status?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
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
      if (!cancelled && attempts < 8) {
        window.setTimeout(poll, 2000);
      } else if (!cancelled) {
        setPending(false);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        {pending && !data?.confirmed ? (
          <div className="glass-card flex flex-col items-center gap-3 p-8">
            <Loader2 size={28} className="animate-spin text-accent-foreground" />
            <p className="text-sm font-bold text-foreground">Confirming your payment...</p>
            <p className="text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        ) : data?.confirmed ? (
          <div className="glass-card flex flex-col items-center gap-3 p-8">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <h1 className="text-xl font-black text-foreground">You&apos;re booked!</h1>
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
            <p className="mt-2 text-xs text-muted-foreground">
              We&apos;ll send the confirmation and calendar invite to your email. Keep these details handy in case delivery is delayed.
            </p>
          </div>
        ) : (
          <div className="glass-card flex flex-col items-center gap-3 p-8">
            <Clock3 size={32} className="text-amber-500" />
            <h1 className="text-lg font-black text-foreground">Almost there</h1>
            <p className="text-sm text-muted-foreground">
              {error || "PayFast is still confirming your payment. Your booking will be confirmed by email shortly."}
            </p>
          </div>
        )}

        <Link href="/book" className="mt-6 text-xs font-bold text-accent-foreground">
          Book another session
        </Link>
      </main>
    </div>
  );
}
