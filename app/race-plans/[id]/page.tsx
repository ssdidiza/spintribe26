"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { SperaIcon } from "@/components/SperaLogo";
import { useHydrated } from "@/lib/useHydrated";
import { useStore } from "@/lib/store";
import {
  READINESS_META,
  TARGET_MODES,
  TERRAIN_META,
  formatDurationMinutes,
  formatRaceLocation,
  formatRaceWhen,
  type Race,
  type SegmentTerrain,
  type TargetMode,
} from "@/lib/races";
import type { RacePlanResult } from "@/lib/race-pacing";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Gauge,
  Info,
  Lock,
  Mountain,
  Route,
} from "lucide-react";

type PlanResponse = {
  id: string;
  mode: TargetMode;
  customFinishMinutes: number | null;
  race: Race | null;
  plan: RacePlanResult;
};

const SEVERITY_STYLE: Record<
  RacePlanResult["warnings"][number]["severity"],
  { color: string; bg: string; border: string }
> = {
  info: { color: "#2563eb", bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.25)" },
  warn: { color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)" },
  high: { color: "#ff4b35", bg: "rgba(255,75,53,0.10)", border: "rgba(255,75,53,0.35)" },
};

export default function RacePlanPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded } = useStore();

  const [data, setData] = useState<PlanResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">("loading");

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
  }, [hydrated, currentUser, isOnboarded, router]);

  useEffect(() => {
    if (!hydrated || !currentUser || !isOnboarded || !params.id) return;
    const controller = new AbortController();
    fetch(`/api/race-plans/${params.id}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setStatus("missing");
          return;
        }
        if (!res.ok) throw new Error("plan unavailable");
        setData((await res.json()) as PlanResponse);
        setStatus("ready");
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [hydrated, currentUser, isOnboarded, params.id]);

  if (!hydrated || !currentUser) return null;

  const race = data?.race;
  const plan = data?.plan;

  return (
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/races")}
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          <span className="text-xs font-bold">Races</span>
        </button>
        <SperaIcon className="h-7 w-7" />
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-4">
        {status === "loading" && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl glass animate-pulse" />
            ))}
          </div>
        )}

        {status === "missing" && (
          <section className="glass-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This plan doesn&apos;t exist or isn&apos;t yours to view.
            </p>
            <button
              type="button"
              onClick={() => router.push("/races")}
              className="mt-3 text-xs font-bold text-accent-foreground underline underline-offset-2"
            >
              Back to races
            </button>
          </section>
        )}

        {status === "error" && (
          <section className="glass-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load this plan. Please try again.</p>
          </section>
        )}

        {status === "ready" && race && plan && (
          <>
            {/* ── Race + selected target hero ─────────────────────────────── */}
            <section className="glass-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-black text-foreground">{race.name}</h1>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {formatRaceLocation(race)} · {formatRaceWhen(race)}
                  </p>
                </div>
                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                  <Lock size={11} /> Private
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <HeroStat
                  icon={<Clock size={15} />}
                  label="Estimated finish"
                  value={formatDurationMinutes(plan.selected.finishMinutes)}
                />
                <HeroStat
                  icon={<Gauge size={15} />}
                  label="Required avg speed"
                  value={`${plan.selected.requiredAvgSpeedKmh} km/h`}
                />
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                {modeLabel(data!.mode)} target ·{" "}
                {plan.riderForm.baseSpeedEstimated
                  ? "based on a league estimate"
                  : `based on your ~${plan.riderForm.baseSpeedKmh} km/h recent riding pace`}
              </p>
            </section>

            {/* ── Readiness ───────────────────────────────────────────────── */}
            <Readiness readiness={plan.readiness} />

            {/* ── Target comparison ───────────────────────────────────────── */}
            <section className="glass-card p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Targets for this race
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["conservative", "realistic", "aggressive"] as const).map((key) => {
                  const target = plan.targets[key];
                  const active = data!.mode === key;
                  return (
                    <div
                      key={key}
                      className="rounded-xl border p-3 text-center"
                      style={
                        active
                          ? { borderColor: "rgba(255,75,53,0.5)", background: "rgba(255,75,53,0.10)" }
                          : { borderColor: "var(--border)", background: "var(--fill-soft)" }
                      }
                    >
                      <p
                        className={`text-[9px] font-black uppercase tracking-wider ${
                          active ? "text-accent-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {key}
                      </p>
                      <p className="mt-1 text-sm font-black text-foreground">
                        {formatDurationMinutes(target.finishMinutes)}
                      </p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">
                        {target.requiredAvgSpeedKmh} km/h
                      </p>
                    </div>
                  );
                })}
              </div>
              {data!.mode === "custom" && (
                <p className="mt-3 rounded-xl border border-[#ff4b35]/40 bg-[#ff4b35]/10 p-3 text-[11px] text-foreground">
                  Your custom target: finish in{" "}
                  <strong>{formatDurationMinutes(plan.selected.finishMinutes)}</strong> at{" "}
                  <strong>{plan.selected.requiredAvgSpeedKmh} km/h</strong> average — about{" "}
                  {plan.selected.flatTargetSpeedKmh} km/h on the flat.
                </p>
              )}
            </section>

            {/* ── Segment pacing ──────────────────────────────────────────── */}
            {plan.selected.segments.length > 0 && (
              <section className="glass-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Route size={15} className="text-accent-foreground" />
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Pace by segment
                  </p>
                </div>
                <div className="space-y-2">
                  {plan.selected.segments.map((seg, index) => (
                    <div
                      key={`${seg.name}-${index}`}
                      className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-foreground">{seg.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {seg.distanceKm} km · {seg.elevationM} m ·{" "}
                            {TERRAIN_META[seg.terrain as SegmentTerrain]?.label ?? seg.terrain}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-accent-foreground">{seg.speedKmh} km/h</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDurationMinutes(seg.timeMinutes)} · @{" "}
                            {formatDurationMinutes(seg.cumulativeMinutes)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-snug text-muted-foreground/70">
                  Segment speeds scale your flat-road target by terrain. Cumulative times assume
                  steady riding without stops.
                </p>
              </section>
            )}

            {/* ── Warnings ────────────────────────────────────────────────── */}
            {plan.warnings.length > 0 && (
              <section className="space-y-2">
                {plan.warnings.map((warning, index) => {
                  const style = SEVERITY_STYLE[warning.severity];
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2 rounded-2xl border p-3"
                      style={{ background: style.bg, borderColor: style.border }}
                    >
                      {warning.severity === "info" ? (
                        <Info size={15} style={{ color: style.color }} className="mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle
                          size={15}
                          style={{ color: style.color }}
                          className="mt-0.5 flex-shrink-0"
                        />
                      )}
                      <p className="text-[12px] leading-snug text-foreground">{warning.message}</p>
                    </div>
                  );
                })}
              </section>
            )}

            {/* ── Footer disclaimer + re-plan ─────────────────────────────── */}
            <section className="glass-card p-4">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                This plan is a private estimate built only from your own Strava rides
                {!race.dataVerified && " and conservative, admin-maintained route data"}. It&apos;s a
                guide, not a guarantee — ride to how you feel on the day.{" "}
                <a href="/legal/health-disclaimer" className="text-accent-foreground underline underline-offset-2">
                  Health disclaimer
                </a>
                .
              </p>
              <button
                type="button"
                onClick={() => router.push("/races")}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-foreground/10 py-2.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
              >
                Change target or pick another race
              </button>
            </section>
          </>
        )}
      </main>
      <NavBar />
    </div>
  );
}

function modeLabel(mode: TargetMode): string {
  return TARGET_MODES.find((m) => m.id === mode)?.label ?? mode;
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-accent-foreground">{icon}</div>
      <p className="mt-2 text-xl font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Readiness({ readiness }: { readiness: RacePlanResult["readiness"] }) {
  const meta = READINESS_META[readiness.status];
  return (
    <section className="glass-card p-4" style={{ borderColor: `${meta.accent}55` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mountain size={16} style={{ color: meta.accent }} />
          <div>
            <p className="text-sm font-black" style={{ color: meta.accent }}>
              {meta.label}
            </p>
            <p className="text-[10px] text-muted-foreground">{meta.blurb}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-foreground">{readiness.score}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">/ 100</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {readiness.factors.map((factor) => (
          <div key={factor.key}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-foreground">{factor.label}</p>
              <p className="text-[10px] font-black text-muted-foreground">{factor.scorePct}%</p>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${factor.scorePct}%`, background: meta.accent }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/70">{factor.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
