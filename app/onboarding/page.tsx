"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Tier, UserRole, TIER_LABELS, TIER_COLORS } from "@/lib/types";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS: { km: Tier; description: string }[] = [
  { km: 200, description: "Building consistency — 50 km/week" },
  { km: 400, description: "Solid commitment — 100 km/week" },
  { km: 800, description: "Serious training — 200 km/week" },
  { km: 1000, description: "Elite distance — 250 km/week" },
];

const REGIONS = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Other"];

type Step = "role" | "invite" | "tier";

// Inner component that uses useSearchParams — must be wrapped in Suspense
function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, login, completeOnboarding } = useStore();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<UserRole | null>(null);
  const [tier, setTier] = useState<Tier | null>(null);
  const [region, setRegion] = useState<string>("Gauteng");
  const [zone, setZone] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteError, setInviteError] = useState<string>("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [leaderboardConsent, setLeaderboardConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stravaId = searchParams.get("strava_id");
    const name = searchParams.get("name");
    const avatar = searchParams.get("avatar");
    if (stravaId && name && !currentUser) {
      login(stravaId, name, avatar ?? "");
    } else if (!stravaId && !currentUser) {
      router.replace("/");
    }
  }, [searchParams, currentUser, login, router]);

  function handleRoleSelect(r: UserRole) {
    setRole(r);
    if (r === "champion") {
      setStep("invite");
    } else {
      setStep("tier");
    }
  }

  async function handleVerifyInvite() {
    if (!inviteCode.trim()) return;
    setInviteLoading(true);
    setInviteError("");
    try {
      const res = await fetch("/api/auth/validate-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });
      const { valid } = await res.json();
      if (valid) {
        setStep("tier");
      } else {
        setInviteError("Invalid invite code. Please check with your champion coordinator.");
      }
    } catch {
      setInviteError("Could not verify invite code. Please try again.");
    }
    setInviteLoading(false);
  }

  async function handleFinish() {
    if (!role || !tier) return;
    if (role === "champion" && !zone.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/users/onboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, tier, zone: zone.trim() || region, leaderboardConsent }),
    });
    if (!res.ok) { setSubmitting(false); return; }
    completeOnboarding(role, tier, zone.trim() || region, leaderboardConsent);
    router.push(role === "champion" ? "/champion" : "/dashboard");
  }

  // Determine step labels and progress
  const isChampion = role === "champion";
  const steps: Step[] = isChampion ? ["role", "invite", "tier"] : ["role", "tier"];
  const currentStepIndex = steps.indexOf(step);
  const totalSteps = steps.length;

  return (
    <main className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[100px] opacity-20"
        style={{ background: "#FF6500" }}
      />

      <div className="relative z-10 flex-1 flex flex-col px-6 pt-12 max-w-md mx-auto w-full">
        {/* Progress bar */}
        <div className="flex gap-2 mb-10">
          {(step === "role" ? ["role", "tier"] : steps).map((s, i) => {
            const barSteps = step === "role" ? ["role", "tier"] : steps;
            const filled = i <= barSteps.indexOf(step);
            return (
              <div
                key={s}
                className="h-0.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: filled ? "#FF6500" : "#ffffff20" }}
              />
            );
          })}
        </div>

        {step === "role" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#FF6500" }}>
              Step 1 of 2
            </p>
            <h2 className="text-3xl font-black text-white mb-1">Who are you?</h2>
            <p className="text-white/50 text-sm mb-8">Choose your role in the Team Vitality challenge</p>

            <div className="space-y-4">
              <RoleCard
                emoji="🏆"
                title="Champion"
                subtitle="I organise & lead the challenge"
                bullets={[
                  "View all member progress",
                  "Log indoor FTP sessions",
                  "Create and manage Zones",
                  "Min 2 champing sessions / month",
                  "Log activity-linked check-ins",
                ]}
                accent="#FF6500"
                onClick={() => handleRoleSelect("champion")}
              />
              <RoleCard
                emoji="🚴"
                title="Member"
                subtitle="I'm participating in the challenge"
                bullets={[
                  "Track monthly km progress",
                  "View tier leaderboard",
                  "Sync Strava activities",
                  "See Zone activity near you",
                ]}
                accent="#ffffff"
                onClick={() => handleRoleSelect("member")}
              />
            </div>
          </div>
        )}

        {step === "invite" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button
              onClick={() => setStep("role")}
              className="text-white/40 text-sm mb-6 text-left hover:text-white/70 transition-colors flex items-center gap-1"
            >
              ← Back
            </button>
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#FF6500" }}>
              Step 2 of {totalSteps}
            </p>
            <h2 className="text-3xl font-black text-white mb-1">Champion Invite</h2>
            <p className="text-white/50 text-sm mb-8">
              Champions are verified leaders. Enter your invite code to continue.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setInviteError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleVerifyInvite(); }}
                  placeholder="e.g. SPINTV26"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 transition-all font-mono tracking-widest"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>

              {inviteError && (
                <p className="text-xs text-[#ffb4ab] rounded-xl px-4 py-2"
                  style={{ background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.2)" }}>
                  {inviteError}
                </p>
              )}

              <button
                onClick={handleVerifyInvite}
                disabled={!inviteCode.trim() || inviteLoading}
                className={cn(
                  "w-full rounded-2xl py-4 font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                  inviteCode.trim() && !inviteLoading
                    ? "text-white hover:opacity-90 active:scale-[0.98]"
                    : "text-white/30 cursor-not-allowed"
                )}
                style={{ background: inviteCode.trim() && !inviteLoading ? "#FF6500" : "#ffffff10" }}
              >
                {inviteLoading ? "Verifying…" : "Verify Code"} {!inviteLoading && <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        )}

        {step === "tier" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button
              onClick={() => setStep(role === "champion" ? "invite" : "role")}
              className="text-white/40 text-sm mb-6 text-left hover:text-white/70 transition-colors flex items-center gap-1"
            >
              ← Back
            </button>
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#FF6500" }}>
              Step {totalSteps} of {totalSteps}
            </p>
            <h2 className="text-3xl font-black text-white mb-1">Pick your challenge</h2>
            <p className="text-white/50 text-sm mb-6">How many km will you ride this month?</p>

            <div className="space-y-3 mb-6">
              {TIERS.map(({ km, description }) => {
                const color = TIER_COLORS[km];
                const selected = tier === km;
                return (
                  <button
                    key={km}
                    onClick={() => setTier(km)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
                      selected ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5 hover:border-white/20"
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-2xl font-black" style={{ color }}>{km}</span>
                        <span className="text-white/40 text-sm">km / month</span>
                        <span
                          className="text-[10px] font-bold rounded-full px-2 py-0.5"
                          style={{ background: `${color}20`, color }}
                        >
                          {TIER_LABELS[km]}
                        </span>
                      </div>
                      <p className="text-white/40 text-xs">{description}</p>
                    </div>
                    {selected ? (
                      <CheckCircle2 size={20} style={{ color: "#FF6500" }} />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-white/20" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Zone input for champions */}
            {role === "champion" && (
              <div className="mb-6">
                <label className="block text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-2">
                  Your Zone <span className="text-[#FF6500]">*</span>
                </label>
                <input
                  type="text"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="e.g. Centurion, Paarl, Durban North"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            )}

            {/* Region picker for members */}
            {role !== "champion" && (
              <div className="mb-6">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-3">Your Region</p>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRegion(r)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        region === r
                          ? "border-orange-500/60 text-orange-400 bg-orange-500/10"
                          : "border-white/10 text-white/40 hover:border-white/20"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboard consent — Strava compliance */}
            <button
              type="button"
              onClick={() => setLeaderboardConsent((v) => !v)}
              className="w-full flex items-start gap-3 text-left rounded-2xl border p-4 transition-all"
              style={{
                borderColor: leaderboardConsent ? "rgba(255,101,0,0.5)" : "rgba(255,255,255,0.1)",
                background: leaderboardConsent ? "rgba(255,101,0,0.08)" : "rgba(255,255,255,0.04)",
              }}
            >
              <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                style={{ borderColor: leaderboardConsent ? "#FF6500" : "rgba(255,255,255,0.3)", background: leaderboardConsent ? "#FF6500" : "transparent" }}>
                {leaderboardConsent && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div>
                <p className="text-xs font-semibold text-white/80 leading-snug">
                  Share my progress on the SpinTribe leaderboard
                </p>
                <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
                  Others in my tier can see my monthly km and ranking. You can change this later from your profile.
                </p>
              </div>
            </button>

            <button
              onClick={handleFinish}
              disabled={!tier || (role === "champion" && !zone.trim()) || submitting}
              className={cn(
                "w-full rounded-2xl py-4 font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                tier && (role !== "champion" || zone.trim()) && !submitting
                  ? "text-white hover:opacity-90 active:scale-[0.98]"
                  : "text-white/30 cursor-not-allowed"
              )}
              style={{ background: tier && (role !== "champion" || zone.trim()) && !submitting ? "#FF6500" : "#ffffff10" }}
            >
              {submitting ? "Setting up…" : <>START CHALLENGE <ChevronRight size={16} /></>}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function RoleCard({
  emoji,
  title,
  subtitle,
  bullets,
  accent,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition-all active:scale-[0.99] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: `${accent}20` }}
        >
          {emoji}
        </div>
        <div className="flex-1">
          <p className="font-black text-white">{title}</p>
          <p className="text-xs text-white/50">{subtitle}</p>
        </div>
        <ChevronRight size={18} className="text-white/30" />
      </div>
      <ul className="space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="text-xs text-white/40 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: accent }} />
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}
