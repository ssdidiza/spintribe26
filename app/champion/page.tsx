"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import {
  getMonthlyKm,
  getChampingSessionsThisMonth,
  getChampingSessionsThisYear,
} from "@/lib/mock-data";
import { Zone, Activity, canAccessChampionFeatures } from "@/lib/types";
import NavBar from "@/components/NavBar";
import ZoneSelector from "@/components/ZoneSelector";
import ActivityPicker from "@/components/ActivityPicker";
import NotificationBanner from "@/components/NotificationBanner";
import {
  Star, MapPin, X, CheckCircle2, AlertCircle, ChevronRight, Trash2, Bike, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ModalStep = "activity" | "notes";

function normalizeZoneName(value?: string) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export default function ChampionPage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const {
    currentUser, isOnboarded, users, activities, zones,
    championSessions, addChampionSession, deleteChampionSession,
    hydrateChampionSessions, hydrateActivities, syncStravaActivities,
  } = useStore();

  const [open,             setOpen]            = useState(false);
  const [step,             setStep]            = useState<ModalStep>("activity");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedZone,     setSelectedZone]    = useState<Zone | null>(null);
  const [notes,            setNotes]           = useState("");
  const [saved,            setSaved]           = useState(false);
  const [confirmDeleteId,  setConfirmDeleteId] = useState<string | null>(null);
  const [syncingYear,      setSyncingYear]     = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
    else if (!canAccessChampionFeatures(currentUser)) router.replace("/dashboard");
    else Promise.all([hydrateChampionSessions(), hydrateActivities()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentUser?.id, isOnboarded]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const champingThisMonth = useMemo(
    () => currentUser ? getChampingSessionsThisMonth(currentUser.id, championSessions) : 0,
    [currentUser, championSessions]
  );
  const champingThisYear = useMemo(
    () => currentUser ? getChampingSessionsThisYear(currentUser.id, championSessions) : 0,
    [currentUser, championSessions]
  );

  const userActivities = useMemo(
    () => activities
      .filter((a) => a.userId === currentUser?.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [activities, currentUser?.id]
  );

  const usedActivityIds = useMemo(
    () => new Set(
      championSessions
        .filter((s) => s.userId === currentUser?.id && s.stravaActivityId)
        .map((s) => s.stravaActivityId!)
    ),
    [championSessions, currentUser?.id]
  );

  const recentSessions = useMemo(
    () => [...championSessions]
      .filter((s) => s.userId === currentUser?.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8),
    [championSessions, currentUser?.id]
  );

  const championZone = useMemo(() => {
    const zoneName = normalizeZoneName(currentUser?.zone ?? currentUser?.region);
    return zones.find((z) => normalizeZoneName(z.name) === zoneName) ?? null;
  }, [zones, currentUser?.zone, currentUser?.region]);

  const tierMembers = useMemo(
    () => users.filter((u) => u.isConnected && u.tier === currentUser?.tier && u.id !== currentUser?.id),
    [users, currentUser?.tier, currentUser?.id]
  );

  const openModal = useCallback(() => {
    setOpen(true);
    setStep("activity");
    setSelectedActivity(null);
    setSelectedZone(null);
    setNotes("");
    setSaved(false);
  }, []);

  const handleYearSync = useCallback(async () => {
    setSyncingYear(true);
    await syncStravaActivities({ scope: "year" });
    setSyncingYear(false);
  }, [syncStravaActivities]);

  const handleActivitySelect = useCallback((activity: Activity) => {
    setSelectedActivity(activity);
    const detectedZone = activity.detectedZoneId
      ? zones.find((z) => z.id === activity.detectedZoneId)
      : null;
    setSelectedZone(detectedZone ?? championZone);
  }, [zones, championZone]);

  const handleSubmit = useCallback(() => {
    if (!selectedActivity) return;
    addChampionSession("champing", notes, {
      zoneId:             selectedZone?.id,
      zoneName:           selectedZone?.name,
      stravaActivityId:   selectedActivity.stravaId,
      stravaActivityName: selectedActivity.name,
      stravaActivityKm:   Math.round(selectedActivity.distance / 1000),
      stravaActivityDate: selectedActivity.date,
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1400);
  }, [selectedActivity, selectedZone, notes, addChampionSession]);

  if (!hydrated || !currentUser || !canAccessChampionFeatures(currentUser)) return null;

  const annualPct = Math.min(100, Math.round((champingThisYear / 10) * 100));
  const currentMonthLabel = format(new Date(), "MMMM");
  const currentYearLabel = format(new Date(), "yyyy");

  return (
    <div className="min-h-screen bg-[#020202] mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} style={{ color: "#ff4b35", filter: "drop-shadow(0 0 6px rgba(255,75,53,0.7))" }} fill="#ff4b35" />
          <h1 className="font-bold text-[#ffffff]">Champ Console</h1>
        </div>
        <span
          className="text-[10px] font-bold rounded-full px-2.5 py-1"
          style={{ border: "1px solid rgba(255,75,53,0.4)", color: "#ff4b35", background: "rgba(255,75,53,0.1)" }}
        >
          {currentUser.tier} km
        </span>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-3xl px-5 py-5 space-y-5">

        <NotificationBanner />

        {/* Annual progress + check-in */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Champing Progress</p>
            <span className="text-[10px] font-bold" style={{ color: "#ff4b35" }}>{champingThisYear} check-ins</span>
          </div>

          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-4">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${annualPct}%`, background: "linear-gradient(90deg,#ff4b35,#ffffff)", boxShadow: "0 0 8px rgba(255,255,255,0.4)" }} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <MiniStat label={`${currentMonthLabel} champing dates`} value={champingThisMonth} target={2}  ok={champingThisMonth >= 2}  caption="/ 2 min" />
            <MiniStat label={`${currentYearLabel} champing dates`}  value={champingThisYear}  target={10} ok={champingThisYear  >= 10} caption="/ 10 goal" />
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-[#b8b8b8]/70">
            Your Strava rides are already synced. Use this screen only to check in rides where you were champing.
          </p>

          <button
            onClick={openModal}
            className="w-full rounded-2xl py-3 font-bold text-sm tracking-widest text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#ff4b35,#ffffff)", boxShadow: "0 0 16px rgba(255,75,53,0.3)" }}
          >
            <Star size={13} fill="currentColor" />
            LOG CHAMPING CHECK-IN
          </button>

          <button
            onClick={handleYearSync}
            disabled={syncingYear}
            className="mt-2 w-full rounded-2xl py-3 font-bold text-xs tracking-widest text-[#ffffff] flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-white/10 bg-white/[0.04] hover:border-[#ff4b35]/40 disabled:opacity-60"
          >
            <RefreshCw size={13} className={syncingYear ? "animate-spin" : ""} />
            {syncingYear ? "IMPORTING YEAR RIDES" : "IMPORT YEAR RIDES"}
          </button>
        </div>

        {/* Recent check-ins */}
        <section>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8] mb-3">Recent Check-ins by Ride Date</p>
          {recentSessions.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <Star size={22} className="mx-auto mb-2 text-[#b8b8b8]/25" />
              <p className="text-sm text-[#b8b8b8]">No check-ins yet.</p>
              <p className="text-[11px] text-[#b8b8b8]/50 mt-1">Log your first champing check-in above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => (
                <div key={s.id} className="glass-card overflow-hidden">
                  <div className="flex items-start gap-3 p-3.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "rgba(255,75,53,0.12)" }}>
                      <Star size={13} style={{ color: "#ff4b35" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#ffffff]">Champing Check-in</p>
                      {s.stravaActivityName && (
                        <p className="text-[10px] text-[#b8b8b8] truncate">
                          {s.stravaActivityName}{s.stravaActivityKm ? ` - ${s.stravaActivityKm} km` : ""}
                        </p>
                      )}
                      {s.zoneName && (
                        <p className="text-[10px] flex items-center gap-1 mt-0.5 text-[#ff4b35]">
                          <MapPin size={9} /> {s.zoneName}
                        </p>
                      )}
                      {s.notes && <p className="text-[10px] text-[#b8b8b8] truncate">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-[10px] text-[#b8b8b8]">Ride {format(new Date(s.date), "MMM d")}</p>
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20"
                      >
                        <Trash2 size={11} className="text-[#b8b8b8]/60 hover:text-[#ffb4ab]" />
                      </button>
                    </div>
                  </div>
                  {confirmDeleteId === s.id && (
                    <div className="flex items-center justify-between gap-2 px-3 pb-3">
                      <p className="text-[11px] text-[#b8b8b8]">Remove this session?</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg px-3 py-1 text-[11px] font-semibold text-[#b8b8b8] glass hover:border-white/20 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { deleteChampionSession(s.id); setConfirmDeleteId(null); }}
                          className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white bg-red-500/80 hover:bg-red-500 transition-all">
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tier members */}
        {tierMembers.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8] mb-3">
              {currentUser.tier} km Tier Members
            </p>
            <div className="space-y-2">
              {tierMembers.map((member) => {
                const km = getMonthlyKm(member.id, activities);
                const p  = Math.min(100, Math.round((km / member.tier) * 100));
                return (
                  <div key={member.id} className="flex items-center gap-3 glass-card p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#ffffff] truncate">{member.name}</p>
                      <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${p}%`, background: "linear-gradient(90deg,#ff4b35,#ffffff)" }} />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#b8b8b8] flex-shrink-0">{km} km</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Check-in modal */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full glass-strong rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto"
            style={{ maxWidth: 512 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 glass px-6 pt-5 pb-4 border-b border-white/[0.08] rounded-t-3xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35]">Champing Check-in</p>
                  <h3 className="font-bold text-[#ffffff] text-lg">
                    {step === "activity" ? "Link a Ride" : "Confirm & Log"}
                  </h3>
                </div>
                <button onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X size={14} className="text-[#b8b8b8]" />
                </button>
              </div>
              <div className="flex gap-1.5">
                {(["activity", "notes"] as ModalStep[]).map((s, i) => (
                  <div key={s} className="h-0.5 flex-1 rounded-full transition-all"
                    style={{ background: i <= (step === "activity" ? 0 : 1) ? "linear-gradient(90deg,#ff4b35,#ffffff)" : "rgba(255,255,255,0.1)" }} />
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {step === "activity" && (
                <>
                  <div className="flex items-start gap-2 rounded-xl p-3"
                    style={{ background: "rgba(255,75,53,0.1)", border: "1px solid rgba(255,75,53,0.2)" }}>
                    <AlertCircle size={13} style={{ color: "#ff4b35" }} className="mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#b8b8b8] leading-relaxed">
                      Choose the Strava ride that proves this champing session. Normal rides stay in your synced ride history. Do not log them here.
                    </p>
                  </div>
                  <ActivityPicker
                    activities={userActivities}
                    value={selectedActivity}
                    onChange={handleActivitySelect}
                    usedActivityIds={usedActivityIds}
                    preferredZoneId={championZone?.id}
                    preferredZoneName={championZone?.name}
                  />
                  <button
                    onClick={() => setStep("notes")}
                    disabled={!selectedActivity}
                    className={cn(
                      "w-full rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                      selectedActivity ? "text-white" : "text-white/30 cursor-not-allowed"
                    )}
                    style={selectedActivity ? {
                      background: "linear-gradient(135deg,#ff4b35,#ffffff)",
                      boxShadow: "0 0 20px rgba(255,75,53,0.4)",
                    } : { background: "rgba(255,255,255,0.06)" }}
                  >
                    CONTINUE <ChevronRight size={15} />
                  </button>
                </>
              )}

              {step === "notes" && (
                <>
                  {/* Linked activity */}
                  {selectedActivity && (
                    <div className="rounded-xl p-3.5 flex items-center gap-3"
                      style={{ background: "rgba(255,75,53,0.08)", border: "1px solid rgba(255,75,53,0.18)" }}>
                      <Bike size={16} className="text-[#ff4b35]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#ffffff] truncate">{selectedActivity.name}</p>
                        <p className="text-[10px] text-[#b8b8b8]">
                          {(selectedActivity.distance / 1000).toFixed(1)} km - {format(new Date(selectedActivity.date), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Zone (optional) */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#b8b8b8] mb-2">
                      Zone <span className="normal-case text-[#b8b8b8]/45 font-normal">- optional</span>
                    </p>
                    <ZoneSelector region={currentUser.region ?? currentUser.zone ?? "Gauteng"} value={selectedZone} onChange={setSelectedZone} />
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)..."
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#ffffff] placeholder:text-[#b8b8b8]/40 resize-none focus:outline-none focus:border-[#ff4b35]/50 transition-colors"
                    rows={3}
                  />

                  <div className="flex gap-2">
                    <button onClick={() => setStep("activity")}
                      className="flex-1 rounded-2xl py-3.5 font-semibold text-sm text-[#b8b8b8] glass hover:border-white/20 transition-all">
                      Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!selectedActivity}
                      className={cn(
                        "flex-1 rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                        saved ? "bg-emerald-500/90 text-white" : "text-white"
                      )}
                      style={!saved ? {
                        background: "linear-gradient(135deg,#ff4b35,#ffffff)",
                        boxShadow: "0 0 20px rgba(255,75,53,0.4)",
                      } : undefined}
                    >
                      {saved ? <><CheckCircle2 size={16} /> Logged!</> : "LOG CHECK-IN"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <NavBar />
    </div>
  );
}

function MiniStat({ label, value, target, ok, caption }: {
  label: string; value: number; target: number; ok: boolean; caption: string;
}) {
  return (
    <div className="rounded-2xl p-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] text-[#b8b8b8] uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-2xl font-black", ok ? "text-emerald-400" : "text-[#ffffff]")}>
        {value}
        <span className="text-[11px] font-normal text-[#b8b8b8] ml-1">{caption}</span>
      </p>
      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, (value / target) * 100)}%`, background: ok ? "#34d399" : "linear-gradient(90deg,#ff4b35,#ffffff)" }} />
      </div>
    </div>
  );
}
