"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Loader2, LockKeyhole } from "lucide-react";
import { BrandMark } from "@/components/SperaLogo";
import { useStore } from "@/lib/store";
import { type Tier, type UserRole, getPostLoginRoute } from "@/lib/types";

const RESTORABLE_ROLES: UserRole[] = ["champion", "member", "admin"];
const VALID_TIERS: Tier[] = [200, 400, 600, 800, 1000];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, login, completeOnboarding } = useStore();
  const handledReturningRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stravaId = searchParams.get("strava_id");
    const name = searchParams.get("name");
    const avatar = searchParams.get("avatar");
    const returning = searchParams.get("returning") === "1";
    const roleParam = searchParams.get("role") as UserRole | null;
    const parsedTier = Number(searchParams.get("tier")) as Tier;
    const zoneParam = searchParams.get("zone") ?? undefined;
    const restoredRole = roleParam && RESTORABLE_ROLES.includes(roleParam) ? roleParam : "member";
    const restoredTier = VALID_TIERS.includes(parsedTier) ? parsedTier : 200;

    if (returning && stravaId && name) {
      if (handledReturningRef.current) return;
      handledReturningRef.current = true;
      login(stravaId, name, avatar ?? "", {
        role: restoredRole,
        tier: restoredTier,
        zone: zoneParam,
        region: zoneParam,
        onboarded: true,
        leaderboardConsent: false,
        rewardsExportConsent: false,
        isConnected: true,
      });
      completeOnboarding(restoredRole, restoredTier, zoneParam, false, false);
      router.replace(getPostLoginRoute({ role: restoredRole }));
      return;
    }

    if (stravaId && name && currentUser?.id !== stravaId) {
      login(stravaId, name, avatar ?? "", { isConnected: true });
    } else if (!stravaId && !currentUser) {
      router.replace("/");
    }
  }, [completeOnboarding, currentUser, login, router, searchParams]);

  async function handleFinish() {
    if (!currentUser) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/users/onboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "member",
          leaderboardConsent: false,
          rewardsExportConsent: false,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { role?: UserRole; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to finish setup");

      const finalRole = data.role ?? (currentUser.role === "admin" ? "admin" : "member");
      completeOnboarding(finalRole, currentUser.tier ?? 200, currentUser.zone, false, false);
      router.push(getPostLoginRoute({ role: finalRole }));
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : "Unable to finish setup");
      setSubmitting(false);
    }
  }

  if (!currentUser) return null;

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col">
        <BrandMark showWordmark iconClassName="h-8 w-8" />

        <section className="my-auto py-10">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FC4C02]/10 text-[#FC4C02]">
            <Check size={26} strokeWidth={2.5} />
          </span>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-accent-foreground">
            Strava connected
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-foreground">
            Your rides. Your progress.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            SpinTribe will use your synced rides for a private monthly progress view. Booking still works separately
            and never requires activity data.
          </p>

          <div className="mt-7 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-4">
            <p className="flex items-center gap-2 text-sm font-black text-foreground">
              <LockKeyhole size={16} className="text-accent-foreground" /> Private by default
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              There are no public rankings or shared ride details in the core experience.
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleFinish}
            disabled={submitting}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff5b1f] via-[#ff3b4d] to-[#ee0075] px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {submitting ? "Finishing setup…" : "Continue to SpinTribe"}
          </button>
        </section>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OnboardingContent />
    </Suspense>
  );
}
