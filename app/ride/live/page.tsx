"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectHeartRate,
  connectTrainer,
  isTrainerSupported,
  type HeartRateConnection,
  type TrainerConnection,
  type TrainerSample,
} from "@/lib/trainer";

// Power zones as fractions of FTP (Coggan model).
const ZONES = [
  { name: "Z1", label: "Recovery", max: 0.55, color: "#9ca3af" },
  { name: "Z2", label: "Endurance", max: 0.75, color: "#38bdf8" },
  { name: "Z3", label: "Tempo", max: 0.9, color: "#4ade80" },
  { name: "Z4", label: "Threshold", max: 1.05, color: "#facc15" },
  { name: "Z5", label: "VO2max", max: 1.2, color: "#ff5b1f" },
  { name: "Z6", label: "Anaerobic", max: 1.5, color: "#ee0075" },
  { name: "Z7", label: "Sprint", max: Infinity, color: "#c084fc" },
] as const;

function zoneFor(power: number, ftp: number) {
  const ratio = ftp > 0 ? power / ftp : 0;
  return ZONES.find((z) => ratio <= z.max) ?? ZONES[ZONES.length - 1];
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Status = "idle" | "connecting" | "live";

const CHART_POINTS = 240; // ~4 minutes at 1 Hz

export default function LiveRidePage() {
  const [supported] = useState(() => isTrainerSupported());
  const [status, setStatus] = useState<Status>("idle");
  const [trainerName, setTrainerName] = useState("");
  const [error, setError] = useState("");

  const [power, setPower] = useState(0);
  const [cadence, setCadence] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);

  const [ftp, setFtp] = useState(200);
  const [elapsed, setElapsed] = useState(0);
  const [avgPower, setAvgPower] = useState(0);
  const [maxPower, setMaxPower] = useState(0);
  const [energyKj, setEnergyKj] = useState(0);
  const [history, setHistory] = useState<number[]>([]);

  const trainerRef = useRef<TrainerConnection | null>(null);
  const hrRef = useRef<HeartRateConnection | null>(null);
  const startedAtRef = useRef<number>(0);
  const statsRef = useRef({ sum: 0, count: 0, max: 0, lastAt: 0 });

  useEffect(() => {
    return () => {
      trainerRef.current?.disconnect();
      hrRef.current?.disconnect();
    };
  }, []);

  // 1 Hz ride clock once live.
  useEffect(() => {
    if (status !== "live") return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  const handleSample = useCallback((sample: TrainerSample) => {
    setPower(sample.power);
    if (sample.cadence !== null) setCadence(sample.cadence);
    if (sample.speed !== null) setSpeed(sample.speed);

    const stats = statsRef.current;
    stats.sum += sample.power;
    stats.count += 1;
    stats.max = Math.max(stats.max, sample.power);
    if (stats.lastAt > 0) {
      // Integrate energy from actual elapsed time between notifications.
      statsRef.current.lastAt = sample.at;
      setEnergyKj((kj) => kj + (sample.power * Math.min(sample.at - stats.lastAt, 5000)) / 1_000_000);
    } else {
      stats.lastAt = sample.at;
    }
    setAvgPower(Math.round(stats.sum / stats.count));
    setMaxPower(stats.max);
    setHistory((h) => [...h.slice(-(CHART_POINTS - 1)), sample.power]);
  }, []);

  async function handleConnectTrainer() {
    setError("");
    setStatus("connecting");
    try {
      const conn = await connectTrainer(handleSample, () => {
        setStatus("idle");
        setError("Trainer disconnected. Pedal a few strokes to wake it, then reconnect.");
      });
      trainerRef.current = conn;
      setTrainerName(conn.deviceName);
      startedAtRef.current = Date.now();
      statsRef.current = { sum: 0, count: 0, max: 0, lastAt: 0 };
      setHistory([]);
      setElapsed(0);
      setEnergyKj(0);
      setStatus("live");
    } catch (e) {
      setStatus("idle");
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "bluetooth_unsupported") {
        setError("This browser can't do Bluetooth. Use Chrome or Edge on a laptop, or Chrome on Android.");
      } else if (/cancel|cancelled|user/i.test(msg)) {
        setError(""); // user closed the picker; stay quiet
      } else {
        setError(
          "Couldn't connect to the trainer. Wake it with a few pedal strokes. If your Garmin is holding its only Bluetooth slot, switch the watch's trainer connection to ANT+ (KICKR v5/v6/CORE support multiple Bluetooth connections).",
        );
      }
    }
  }

  async function handleConnectHr() {
    setError("");
    try {
      const conn = await connectHeartRate(setHeartRate, () => setHeartRate(null));
      hrRef.current = conn;
    } catch {
      setError("No heart-rate broadcaster found. On your Garmin: enable Settings → Sensors → Wrist Heart Rate → Broadcast, or wear a chest strap.");
    }
  }

  function handleDisconnect() {
    trainerRef.current?.disconnect();
    hrRef.current?.disconnect();
    trainerRef.current = null;
    hrRef.current = null;
    setStatus("idle");
  }

  const zone = zoneFor(power, ftp);
  const chartMax = Math.max(ftp * 1.5, ...history, 100);
  const points = history
    .map((p, i) => {
      const x = (i / (CHART_POINTS - 1)) * 100;
      const y = 100 - (p / chartMax) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  if (supported === false) {
    return (
      <main className="min-h-screen bg-background px-6 pb-28 pt-10 text-foreground">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Live Ride</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">This browser can&apos;t do Bluetooth.</h1>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-muted-foreground">
            <p>Live trainer data needs Web Bluetooth. Open this page in:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Chrome or Edge on a laptop near your trainer</li>
              <li>Chrome on an Android phone</li>
            </ul>
            <p className="mt-3">Safari and iOS browsers don&apos;t support Web Bluetooth.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 pb-28 pt-10 text-foreground">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff5a45]">Live Ride</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">
              {status === "live" ? trainerName : "Ride HUD"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {status === "live"
                ? "Streaming from your trainer over Bluetooth. Your Garmin keeps recording as usual."
                : "Pair your smart trainer over Bluetooth and watch power, cadence and heart rate live."}
            </p>
          </div>
          {status === "live" ? (
            <button onClick={handleDisconnect} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 hover:text-white">
              End ride
            </button>
          ) : (
            <button
              onClick={handleConnectTrainer}
              disabled={status === "connecting"}
              className="rounded-xl bg-gradient-to-r from-[#ff5b1f] to-[#ee0075] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {status === "connecting" ? "Searching…" : "Connect trainer"}
            </button>
          )}
        </div>

        {error && <p role="alert" className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

        {status !== "live" && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-muted-foreground">
            <p className="font-bold text-foreground">Before you pair</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Pedal a few strokes so the trainer is awake and broadcasting.</li>
              <li>Keep this laptop or phone within a few metres of the trainer.</li>
              <li>Your Garmin can stay connected — it usually uses ANT+, leaving Bluetooth free.</li>
            </ul>
          </div>
        )}

        {status === "live" && (
          <>
            {/* Hero metric: power, zone-coloured */}
            <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/45">Power</p>
                  <p className="mt-1 font-black tabular-nums leading-none" style={{ color: zone.color, fontSize: "clamp(4.5rem, 14vw, 9rem)" }}>
                    {power}
                    <span className="ml-2 align-baseline text-2xl font-extrabold text-white/45">W</span>
                  </p>
                </div>
                <div className="pb-2 text-right">
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/45">Zone</p>
                  <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: zone.color }}>{zone.name}</p>
                  <p className="text-sm text-muted-foreground">{zone.label}</p>
                </div>
              </div>

              {/* Zone ladder */}
              <div className="mt-6 flex gap-1">
                {ZONES.map((z) => (
                  <div
                    key={z.name}
                    className="h-2 flex-1 rounded-full transition-opacity"
                    style={{ backgroundColor: z.color, opacity: z.name === zone.name ? 1 : 0.2 }}
                  />
                ))}
              </div>
            </section>

            {/* Secondary metrics */}
            <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Cadence", value: cadence !== null ? String(cadence) : "—", unit: "rpm" },
                { label: "Heart rate", value: heartRate !== null ? String(heartRate) : "—", unit: "bpm" },
                { label: "Elapsed", value: formatElapsed(elapsed), unit: "" },
                { label: "Speed", value: speed !== null ? speed.toFixed(1) : "—", unit: "km/h" },
                { label: "Avg power", value: String(avgPower), unit: "W" },
                { label: "Max power", value: String(maxPower), unit: "W" },
                { label: "Energy", value: energyKj.toFixed(0), unit: "kJ" },
                { label: "Work", value: `${Math.round((avgPower / Math.max(ftp, 1)) * 100)}`, unit: "% FTP" },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45">{m.label}</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {m.value}
                    {m.unit && <span className="ml-1 text-xs font-bold text-white/45">{m.unit}</span>}
                  </p>
                </div>
              ))}
            </section>

            {/* Live power curve */}
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45">Power · last 4 min</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  FTP
                  <input
                    type="number"
                    value={ftp}
                    min={50}
                    max={600}
                    onChange={(e) => setFtp(Math.max(50, Number(e.target.value) || 200))}
                    className="w-16 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-right font-bold tabular-nums text-foreground"
                  />
                  W
                </label>
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-32 w-full">
                <defs>
                  <linearGradient id="powerStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff5b1f" />
                    <stop offset="100%" stopColor="#ee0075" />
                  </linearGradient>
                </defs>
                {/* FTP reference line */}
                <line x1="0" x2="100" y1={100 - (ftp / chartMax) * 100} y2={100 - (ftp / chartMax) * 100} stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                {points && (
                  <polyline points={points} fill="none" stroke="url(#powerStroke)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                )}
              </svg>
              <p className="mt-1 text-right text-[10px] text-white/35">dashed line = FTP ({ftp} W)</p>
            </section>

            {heartRate === null && (
              <button onClick={handleConnectHr} className="mt-4 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 hover:text-white">
                Add heart rate (watch broadcast or chest strap)
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
