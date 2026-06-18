"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { SperaIcon } from "@/components/SperaLogo";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import {
  DIFFICULTY_META,
  ROUTE_TYPE_META,
  READINESS_META,
  TARGET_MODES,
  formatDurationMinutes,
  formatRaceLocation,
  formatRaceWhen,
  type Race,
  type TargetMode,
} from "@/lib/races";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Flag,
  Lock,
  Mountain,
  RefreshCw,
  Route,
} from "lucide-react";

type PlanSummary = {
  id: string;
  raceId: string;
  mode: TargetMode;
  readinessStatus: keyof typeof READINESS_META;
  finishMinutes: number | null;
};

export default function RacesPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded } = useStore();

  const [races, setRaces] = useState<Race[] | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [openRaceId, setOpenRaceId] = useState<string | null>(null);
  const [mode, setMode] = useState<TargetMode>("realistic");
  const [customHours, setCustomHours] = useState("3");
  const [customMinutes, setCustomMinutes] = useState("30");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded) return;
    const controller = new AbortController();
    async function load() {
      setStatus("loading");
      try {
        const [racesRes, plansRes] = await Promise.all([
          fetch("/api/races", { signal: controller.signal }),
          fetch("/api/race-plans", { signal: controller.signal }),
        ]);
        if (!racesRes.ok) throw new Error("races unavailable");
        const racesJson = (await racesRes.json()) as { races: Race[] };
        const plansJson = plansRes.ok ? ((await plansRes.json()) as { plans: PlanSummary[] }) : { plans: [] };
        setRaces(racesJson.races ?? []);
        setPlans(plansJson.plans ?? []);
        setStatus("ready");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded]);

  const planByRace = useMemo(() => {
    const map = new Map<string, PlanSummary>();
    for (const plan of plans) map.set(plan.raceId, plan);
    return map;
  }, [plans]);

  async function generatePlan(race: Race) {
    setGenerating(true);
    setGenError("");
    try {
      const customFinishMinutes =
        mode === "custom"
          ? Math.max(0, Number(customHours || 0)) * 60 + Math.max(0, Number(customMinutes || 0))
          : undefined;
      if (mode === "custom" && (!customFinishMinutes || customFinishMinutes <= 0)) {
        setGenError("Enter a finish time greater than zero.");
        setGenerating(false);
        return;
      }
      const res = await fetch("/api/race-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId: race.id, targetMode: mode, customFinishMinutes }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not generate plan");
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/race-plans/${id}`);
    } catch (err) {
      setGenError((err as Error).message);
      setGenerating(false);
    }
  }

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Race pace planner
          </p>
          <h1 className="font-bold text-foreground text-xl">Races</h1>
        </div>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">
        <section className="glass-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ff4b35]/12 text-accent-foreground">
              <Flag size={16} />
            </span>
            <div>
              <p className="text-sm font-black text-foreground">Pick your race. Get a private plan.</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                SpinTribe already knows your riding — choose a target and we build the pacing.
              </p>
            </div>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
            <Lock size={11} /> Plans are private to you
          </p>
        </section>

        {status === "loading" && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl glass animate-pulse" />
            ))}
          </div>
        )}

        {status === "error" && (
          <section className="glass-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              The race library is temporarily unavailable. Please try again.
            </p>
            <button
              type="button"
              onClick={() => setStatus("loading")}
              className="mt-3 text-xs font-bold text-accent-foreground underline underline-offset-2"
            >
              Retry
            </button>
          </section>
        )}

        {status === "ready" && races && races.length === 0 && (
          <section className="glass-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No races in the library yet.</p>
          </section>
        )}

        {status === "ready" &&
          races?.map((race) => {
            const existing = planByRace.get(race.id);
            const difficulty = DIFFICULTY_META[race.difficulty];
            const isOpen = openRaceId === race.id;
            return (
              <section key={race.id} className="glass-card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black text-foreground">{race.name}</h2>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {formatRaceLocation(race)} · {formatRaceWhen(race)}
                      </p>
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide"
                      style={{ background: `${difficulty.accent}1f`, color: difficulty.accent }}
                    >
                      {difficulty.label}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Chip icon={<Route size={12} />} label={`${Math.round(race.distanceKm)} km`} />
                    <Chip icon={<Mountain size={12} />} label={`${Math.round(race.elevationM)} m`} />
                    <Chip label={ROUTE_TYPE_META[race.routeType].label} />
                  </div>

                  {!race.dataVerified && (
                    <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground/70">
                      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                      Route figures are conservative estimates, admin-maintained until verified.
                    </p>
                  )}

                  {existing && (
                    <button
                      type="button"
                      onClick={() => router.push(`/race-plans/${existing.id}`)}
                      className="mt-3 flex w-full items-center justify-between rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-left transition-colors hover:border-[#ff4b35]/30"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Your plan
                        </p>
                        <p className="mt-0.5 text-sm font-black text-foreground">
                          {READINESS_META[existing.readinessStatus]?.label ?? "Plan ready"}
                          {existing.finishMinutes != null && (
                            <span className="ml-1.5 font-bold text-accent-foreground">
                              · ~{formatDurationMinutes(existing.finishMinutes)}
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setGenError("");
                      setMode("realistic");
                      setOpenRaceId(isOpen ? null : race.id);
                    }}
                    className={cn(
                      "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black transition-all",
                      isOpen
                        ? "border border-foreground/10 text-muted-foreground"
                        : "gradient-primary text-white"
                    )}
                  >
                    {isOpen ? "Close" : existing ? "Re-plan this race" : "Plan this race"}
                    {!isOpen && <ArrowRight size={14} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-foreground/[0.08] bg-foreground/[0.02] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      Choose your target
                    </p>
                    <div className="mt-3 grid gap-2">
                      {TARGET_MODES.map((target) => {
                        const active = mode === target.id;
                        return (
                          <button
                            key={target.id}
                            type="button"
                            onClick={() => setMode(target.id)}
                            className={cn(
                              "rounded-xl border p-3 text-left transition-all",
                              active
                                ? "border-[#ff4b35]/55 bg-[#ff4b35]/12"
                                : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20"
                            )}
                          >
                            <p
                              className={cn(
                                "text-sm font-black",
                                active ? "text-accent-foreground" : "text-foreground"
                              )}
                            >
                              {target.label}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{target.blurb}</p>
                          </button>
                        );
                      })}
                    </div>

                    {mode === "custom" && (
                      <div className="mt-3 flex items-end gap-2">
                        <TimeField label="Hours" value={customHours} onChange={setCustomHours} max={24} />
                        <span className="pb-2 text-lg font-black text-muted-foreground">:</span>
                        <TimeField label="Minutes" value={customMinutes} onChange={setCustomMinutes} max={59} />
                      </div>
                    )}

                    {genError && (
                      <p className="mt-3 text-xs text-[#ff4b35]">{genError}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => generatePlan(race)}
                      disabled={generating}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-black text-white transition-all disabled:opacity-50"
                    >
                      {generating ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" /> Building your plan…
                        </>
                      ) : (
                        <>
                          Generate pace plan <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
      </main>
      <NavBar />
    </div>
  );
}

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function TimeField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-foreground/[0.1] bg-background px-3 py-2 text-center text-lg font-black text-foreground outline-none focus:border-[#ff4b35]/50"
      />
    </label>
  );
}
