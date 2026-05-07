"use client";
import { useEffect, useState } from "react";
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
import {
  Star, Dumbbell, MapPin, X, CheckCircle2, AlertCircle,
  ChevronRight, Bike, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ModalType = "ftp" | "champing" | null;
type ModalStep = "activity" | "zone" | "notes";

export default function ChampionPage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const {
    currentUser, isOnboarded, users, activities, zones,
    championSessions, addChampionSession, deleteChampionSession,
    hydrateChampionSessions,
  } = useStore();

  const [modal,          setModal]          = useState<ModalType>(null);
  const [step,           setStep]           = useState<ModalStep>("activity");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedZone,   setSelectedZone]   = useState<Zone | null>(null);
  const [notes,          setNotes]          = useState("");
  const [saved,          setSaved]          = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) router.replace("/");
    else if (!isOnboarded) router.replace("/onboarding");
    else if (!canAccessChampionFeatures(currentUser)) router.replace("/dashboard");
    else hydrateChampionSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentUser, isOnboarded]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (modal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  if (!hydrated || !currentUser || !canAccessChampionFeatures(currentUser)) return null;

  const userRegion       = currentUser.region ?? "Gauteng";
  const champingThisMonth = getChampingSessionsThisMonth(currentUser.id, championSessions);
  const champingThisYear  = getChampingSessionsThisYear(currentUser.id, championSessions);
  const ftpSessions       = championSessions.filter(
    (s) => s.userId === currentUser.id && s.type === "ftp_improver"
  ).length;

  const totalSessions = champingThisYear + ftpSessions;
  const annualPct     = Math.min(100, Math.round((totalSessions / 22) * 100));

  const userActivities = activities
    .filter((a) => a.userId === currentUser.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Rule D: already-logged strava activity IDs
  const usedActivityIds = new Set(
    championSessions
      .filter((s) => s.userId === currentUser.id && s.stravaActivityId)
      .map((s) => s.stravaActivityId!)
  );

  const recentSessions = [...championSessions]
    .filter((s) => s.userId === currentUser.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  const opportunityZones = zones
    .filter((z) => z.region === userRegion || z.region === "National")
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 3);

  const tierMembers = users.filter(
    (u) => u.isConnected && u.tier === currentUser.tier && u.id !== currentUser.id
  );

  function openModal(type: ModalType, preselectedZone?: Zone) {
    setModal(type);
    setStep("activity");
    setSelectedActivity(null);
    setSelectedZone(preselectedZone ?? null);
    setNotes("");
    setSaved(false);
  }

  function handleSubmit() {
    if (!modal || !selectedActivity) return;
    addChampionSession(
      modal === "ftp" ? "ftp_improver" : "champing",
      notes,
      {
        zoneId:              selectedZone?.id,
        zoneName:            selectedZone?.name,
        stravaActivityId:    selectedActivity.stravaId,
        stravaActivityName:  selectedActivity.name,
        stravaActivityKm:    Math.round(selectedActivity.distance / 1000),
      }
    );
    setSaved(true);
    setTimeout(() => { setSaved(false); setModal(null); }, 1600);
  }

  const canAdvance = !!selectedActivity;
  const canSubmit  = !!selectedActivity && (modal === "ftp" || !!selectedZone);

  return (
    <div className="min-h-screen bg-[#131313] mb-nav">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} style={{ color: "#cdbdff", filter: "drop-shadow(0 0 6px rgba(124,77,255,0.7))" }} fill="#cdbdff" />
          <h1 className="font-bold text-[#e5e2e1]">Champ Console</h1>
        </div>
        <span
          className="text-[10px] font-bold rounded-full px-2.5 py-1"
          style={{
            border: "1px solid rgba(124,77,255,0.4)",
            color: "#cdbdff",
            background: "rgba(124,77,255,0.1)",
          }}
        >
          {currentUser.tier} km
        </span>
      </header>

      <main className="max-w-lg mx-auto px-5 py-5 space-y-5">

        {/* Annual progress */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">Annual Progress</p>
            <p className="text-[10px] font-bold text-[#cdbdff]">{totalSessions} sessions</p>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-3">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${annualPct}%`,
                background: "linear-gradient(90deg, #7c4dff, #00e3fd)",
                boxShadow: "0 0 8px rgba(0,227,253,0.4)",
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Champing / Month" value={champingThisMonth} target={2}  suffix="/ 2 min"    ok={champingThisMonth >= 2} />
            <MiniStat label="Champing / Year"  value={champingThisYear}  target={10} suffix="/ 10 target" ok={champingThisYear  >= 10} />
          </div>
        </div>

        {/* Check-in grid */}
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">Check In</p>
          <div className="grid grid-cols-2 gap-3">
            <ActionCard
              icon={<Bike size={20} style={{ color: "#cdbdff" }} />}
              label="Log Outdoor Session"
              subtitle="Race or zone activity"
              onClick={() => openModal("champing")}
              gradient="rgba(124,77,255,0.12)"
            />
            <ActionCard
              icon={<Dumbbell size={20} style={{ color: "#00e3fd" }} />}
              label="FTP Improver"
              subtitle="Indoor structured"
              onClick={() => openModal("ftp")}
              gradient="rgba(0,227,253,0.08)"
            />
          </div>
        </div>

        {/* FTP count */}
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(0,227,253,0.1)" }}>
            <Dumbbell size={22} style={{ color: "#00e3fd" }} />
          </div>
          <div className="flex-1">
            <p className="font-bold text-[#e5e2e1] text-sm">FTP Improver Sessions</p>
            <p className="text-[11px] text-[#cac3d8]">Indoor structured training</p>
          </div>
          <p className="text-4xl font-bold" style={{ color: "#00e3fd", textShadow: "0 0 10px rgba(0,227,253,0.4)" }}>
            {ftpSessions}
          </p>
        </div>

        {/* Zone opportunities */}
        {opportunityZones.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">Champing Opportunities</p>
            <div className="space-y-2">
              {opportunityZones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => openModal("champing", zone)}
                  className="w-full flex items-center gap-3 glass-card p-3 text-left hover:border-[#7c4dff]/40 transition-all"
                >
                  <div className="w-9 h-9 rounded-xl glass flex items-center justify-center flex-shrink-0">
                    <MapPin size={14} style={{ color: "#cdbdff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#e5e2e1] truncate">{zone.name}</p>
                    <p className="text-[10px] text-[#cac3d8]">{zone.region} · {zone.usageCount} sessions</p>
                  </div>
                  <ChevronRight size={14} className="text-[#cac3d8]" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recent check-ins */}
        <section>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">Recent Check-ins</p>
          {recentSessions.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-[#cac3d8] text-sm">No sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => (
                <div key={s.id} className="glass-card overflow-hidden">
                  <div className="flex items-start gap-3 p-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: s.type === "champing" ? "rgba(124,77,255,0.15)" : "rgba(0,227,253,0.1)" }}>
                      {s.type === "champing"
                        ? <Star size={13} style={{ color: "#cdbdff" }} />
                        : <Dumbbell size={13} style={{ color: "#00e3fd" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#e5e2e1]">
                        {s.type === "champing" ? "Champing Session" : "FTP Improver"}
                      </p>
                      {s.stravaActivityName && (
                        <p className="text-[10px] text-[#cac3d8] truncate">
                          🚴 {s.stravaActivityName}{s.stravaActivityKm ? ` · ${s.stravaActivityKm} km` : ""}
                        </p>
                      )}
                      {s.zoneName && (
                        <p className="text-[10px] flex items-center gap-1 mt-0.5 text-[#cdbdff]">
                          <MapPin size={9} /> {s.zoneName}
                        </p>
                      )}
                      {s.notes && <p className="text-[10px] text-[#cac3d8] truncate">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-[10px] text-[#cac3d8]">{format(new Date(s.date), "MMM d")}</p>
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="w-6 h-6 rounded-lg glass hover:bg-red-500/20 flex items-center justify-center transition-colors"
                        title="Remove session"
                      >
                        <Trash2 size={11} className="text-[#cac3d8]/60 hover:text-[#ffb4ab]" />
                      </button>
                    </div>
                  </div>

                  {/* Inline delete confirmation */}
                  {confirmDeleteId === s.id && (
                    <div className="flex items-center justify-between gap-2 px-3 pb-3">
                      <p className="text-[11px] text-[#cac3d8]">Remove this session?</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg px-3 py-1 text-[11px] font-semibold text-[#cac3d8] glass hover:border-white/20 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { deleteChampionSession(s.id); setConfirmDeleteId(null); }}
                          className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white bg-red-500/80 hover:bg-red-500 transition-all"
                        >
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

        {/* Tier members admin view */}
        {tierMembers.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8] mb-3">
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
                      <p className="text-sm font-semibold text-[#e5e2e1] truncate">{member.name}</p>
                      <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${p}%`, background: "linear-gradient(90deg,#7c4dff,#00e3fd)" }} />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#cac3d8] flex-shrink-0">{km} km</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full glass-strong rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto mx-auto"
            style={{ maxWidth: 512 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 glass px-6 pt-5 pb-4 border-b border-white/[0.08] rounded-t-3xl sm:rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cdbdff]">
                    {modal === "ftp" ? "FTP Improver" : "Champing Session"}
                  </p>
                  <h3 className="font-bold text-[#e5e2e1] text-lg">
                    {step === "activity" ? "Link Activity" : step === "zone" ? "Select Zone" : "Confirm & Log"}
                  </h3>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="w-8 h-8 rounded-full glass flex items-center justify-center"
                >
                  <X size={14} className="text-[#cac3d8]" />
                </button>
              </div>
              {/* Progress steps */}
              <div className="flex gap-1.5 mt-3">
                {(modal === "champing" ? ["activity", "zone", "notes"] : ["activity", "notes"]).map((s, i) => (
                  <div
                    key={s}
                    className="h-0.5 flex-1 rounded-full transition-all"
                    style={{
                      background: i <= (step === "activity" ? 0 : step === "zone" ? 1 : 2)
                        ? "linear-gradient(90deg,#7c4dff,#00e3fd)"
                        : "rgba(255,255,255,0.1)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {step === "activity" && (
                <>
                  <div className="flex items-start gap-2 rounded-xl p-3"
                    style={{ background: "rgba(124,77,255,0.1)", border: "1px solid rgba(124,77,255,0.2)" }}>
                    <AlertCircle size={13} style={{ color: "#cdbdff" }} className="mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#cac3d8] leading-relaxed">
                      A recorded <strong className="text-[#e5e2e1]">ride or run</strong> is required as proof of activity.
                      Select from your recent Strava activities.
                    </p>
                  </div>
                  <ActivityPicker
                    activities={userActivities}
                    value={selectedActivity}
                    onChange={setSelectedActivity}
                    usedActivityIds={usedActivityIds}
                  />
                  <button
                    onClick={() => setStep(modal === "champing" ? "zone" : "notes")}
                    disabled={!canAdvance}
                    className={cn(
                      "w-full rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                      canAdvance ? "text-white" : "text-white/30 cursor-not-allowed"
                    )}
                    style={canAdvance ? {
                      background: "linear-gradient(135deg, #7c4dff, #00e3fd)",
                      boxShadow: "0 0 20px rgba(124,77,255,0.4)",
                    } : { background: "rgba(255,255,255,0.06)" }}
                  >
                    CONTINUE <ChevronRight size={15} />
                  </button>
                </>
              )}

              {step === "zone" && modal === "champing" && (
                <>
                  <p className="text-xs text-[#cac3d8] leading-relaxed">
                    Choose an existing Zone or create a new one. Reuse zones to build community density.
                  </p>
                  <ZoneSelector region={userRegion} value={selectedZone} onChange={setSelectedZone} />
                  <div className="flex gap-2">
                    <button onClick={() => setStep("activity")}
                      className="flex-1 rounded-2xl py-3.5 font-semibold text-sm text-[#cac3d8] glass hover:border-white/20 transition-all">
                      Back
                    </button>
                    <button
                      onClick={() => setStep("notes")}
                      disabled={!selectedZone}
                      className={cn("flex-1 rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                        selectedZone ? "text-white" : "text-white/30 cursor-not-allowed")}
                      style={selectedZone ? {
                        background: "linear-gradient(135deg, #7c4dff, #00e3fd)",
                        boxShadow: "0 0 20px rgba(124,77,255,0.4)",
                      } : { background: "rgba(255,255,255,0.06)" }}
                    >
                      CONTINUE <ChevronRight size={15} />
                    </button>
                  </div>
                </>
              )}

              {step === "notes" && (
                <>
                  <div className="rounded-2xl glass p-4 space-y-2.5">
                    {selectedActivity && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🚴</span>
                        <div>
                          <p className="text-xs font-semibold text-[#e5e2e1]">{selectedActivity.name}</p>
                          <p className="text-[10px] text-[#cac3d8]">
                            {(selectedActivity.distance / 1000).toFixed(1)} km · {format(new Date(selectedActivity.date), "MMM d")}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedZone && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} style={{ color: "#cdbdff" }} />
                        <div>
                          <p className="text-xs font-semibold text-[#e5e2e1]">{selectedZone.name}</p>
                          <p className="text-[10px] text-[#cac3d8]">{selectedZone.region} · {selectedZone.type}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Session notes (optional)…"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#e5e2e1] placeholder:text-[#cac3d8]/50 resize-none focus:outline-none focus:border-[#7c4dff]/50 transition-colors"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep(modal === "champing" ? "zone" : "activity")}
                      className="flex-1 rounded-2xl py-3.5 font-semibold text-sm text-[#cac3d8] glass hover:border-white/20 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className={cn(
                        "flex-1 rounded-2xl py-3.5 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                        saved ? "bg-emerald-500 text-white" : canSubmit ? "text-white" : "text-white/30 cursor-not-allowed"
                      )}
                      style={!saved && canSubmit ? {
                        background: "linear-gradient(135deg, #7c4dff, #00e3fd)",
                        boxShadow: "0 0 20px rgba(124,77,255,0.4)",
                      } : undefined}
                    >
                      {saved ? <><CheckCircle2 size={16} /> Logged!</> : "LOG SESSION"}
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

function MiniStat({ label, value, target, suffix, ok }: {
  label: string; value: number; target: number; suffix: string; ok: boolean;
}) {
  return (
    <div className="rounded-2xl glass p-3">
      <p className="text-[10px] text-[#cac3d8] uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold mt-0.5", ok ? "text-emerald-400" : "text-[#e5e2e1]")}>
        {value}<span className="text-[11px] text-[#cac3d8] font-normal"> {suffix}</span>
      </p>
      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, (value / target) * 100)}%`,
            background: ok ? "#34d399" : "linear-gradient(90deg,#7c4dff,#00e3fd)",
          }}
        />
      </div>
    </div>
  );
}

function ActionCard({ icon, label, subtitle, onClick, gradient }: {
  icon: React.ReactNode; label: string; subtitle: string; onClick: () => void; gradient: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2.5 glass-card p-5 hover:border-[#7c4dff]/40 transition-all active:scale-[0.97] w-full"
    >
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
        style={{ background: gradient }}>
        {icon}
      </div>
      <div className="text-center">
        <p className="font-bold text-sm text-[#e5e2e1] leading-tight">{label}</p>
        <p className="text-[10px] text-[#cac3d8] mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}
