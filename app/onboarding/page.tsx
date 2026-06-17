"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Tier, UserRole, getPostLoginRoute } from "@/lib/types";
import { Bike, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const REGIONS = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Other"];

type Step = "role" | "invite" | "tier";
const RESTORABLE_ROLES: UserRole[] = ["champion", "member", "admin"];
const VALID_TIERS: Tier[] = [200, 400, 600, 800, 1000];

// Inner component that uses useSearchParams - must be wrapped in Suspense
function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, login, completeOnboarding } = useStore();
  const handledReturningRef = useRef(false);
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<UserRole | null>(null);
  const [region, setRegion] = useState<string>("Gauteng");
  const [zone, setZone] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteError, setInviteError] = useState<string>("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [leaderboardConsent, setLeaderboardConsent] = useState(true);
  const [rewardsExportConsent, setRewardsExportConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stravaId = searchParams.get("strava_id");
    const name = searchParams.get("name");
    const avatar = searchParams.get("avatar");
    const returning = searchParams.get("returning") === "1";
    const roleParam = searchParams.get("role") as UserRole | null;
    const parsedTier = Number(searchParams.get("tier")) as Tier;
    const zoneParam = searchParams.get("zone") ?? undefined;
    const teamIdParam = searchParams.get("team_id") ?? undefined;
    const currentLeagueIdParam = searchParams.get("current_league_id") ?? undefined;
    const currentLeagueNameParam = searchParams.get("current_league_name") ?? undefined;
    const parsedCurrentLeagueThreshold = Number(searchParams.get("current_league_threshold"));
    const consentParam = searchParams.get("leaderboard_consent") === "1";
    const rewardsConsentParam = searchParams.get("rewards_export_consent") === "1";
    const restoredRole = roleParam && RESTORABLE_ROLES.includes(roleParam) ? roleParam : "member";
    const restoredTier = VALID_TIERS.includes(parsedTier) ? parsedTier : 400;

    if (returning && stravaId && name) {
      if (handledReturningRef.current) return;
      handledReturningRef.current = true;
      login(stravaId, name, avatar ?? "", {
        role: restoredRole,
        tier: restoredTier,
        teamId: teamIdParam,
        currentLeagueId: currentLeagueIdParam,
        currentLeagueName: currentLeagueNameParam,
        currentLeagueThreshold: VALID_TIERS.includes(parsedCurrentLeagueThreshold as Tier)
          ? parsedCurrentLeagueThreshold
          : restoredTier,
        zone: zoneParam,
        region: zoneParam,
        onboarded: true,
        leaderboardConsent: consentParam,
        rewardsExportConsent: rewardsConsentParam,
      });
      completeOnboarding(restoredRole, restoredTier, zoneParam, consentParam, rewardsConsentParam);
      router.replace(getPostLoginRoute({ role: restoredRole }));
      return;
    }

    if (stravaId && name && !currentUser) {
      login(stravaId, name, avatar ?? "");
    } else if (!stravaId && !currentUser) {
      router.replace("/");
    }
  }, [searchParams, currentUser, login, completeOnboarding, router]);

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
    if (!role) return;
    if (role === "champion" && !zone.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/users/onboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, zone: zone.trim() || region, leaderboardConsent, rewardsExportConsent }),
    });
    if (!res.ok) { setSubmitting(false); return; }
    const finalRole = currentUser?.role === "admin" ? "admin" : role;
    // Everyone starts in the 200 Club; the server places and fast-tracks from
    // verified Strava distance. 200 is the local mirror until the next hydrate.
    completeOnboarding(finalRole, 200, zone.trim() || region, leaderboardConsent, rewardsExportConsent);
    router.push(getPostLoginRoute({ role: finalRole }));
  }

  // Determine step labels and progress
  const isChampion = role === "champion";
  const steps: Step[] = isChampion ? ["role", "invite", "tier"] : ["role", "tier"];
  const totalSteps = steps.length;

  return (
    <main className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[100px] opacity-20"
        style={{ background: "#ff4b35" }}
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
                style={{ background: filled ? "#ff4b35" : "var(--fill-mid)" }}
              />
            );
          })}
        </div>

        {step === "role" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent-foreground)" }}>
              Step 1 of 2
            </p>
            <h2 className="text-3xl font-black text-foreground mb-1">Who are you?</h2>
            <p className="text-muted-foreground text-sm mb-8">Choose your role in the Team Vitality challenge</p>

            <div className="space-y-4">
              <RoleCard
                icon={<Trophy size={20} />}
                title="Champion"
                subtitle="I organise & lead the challenge"
                bullets={[
                  "View all member progress",
                  "Log indoor FTP sessions",
                  "Create and manage Zones",
                  "Min 2 champing check-ins / month",
                  "Log ride-linked champing proof",
                ]}
                accent="#ff4b35"
                onClick={() => handleRoleSelect("champion")}
              />
              <RoleCard
                icon={<Bike size={20} />}
                title="Member"
                subtitle="I'm participating in the challenge"
                bullets={[
                  "Track monthly km progress",
                  "View tier leaderboard",
                  "Sync Strava activities",
                  "See Zone activity near you",
                ]}
                accent="var(--foreground)"
                onClick={() => handleRoleSelect("member")}
              />
            </div>
          </div>
        )}

        {step === "invite" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button
              onClick={() => setStep("role")}
              className="text-muted-foreground text-sm mb-6 text-left hover:text-foreground transition-colors flex items-center gap-1"
            >
              Back
            </button>
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent-foreground)" }}>
              Step 2 of {totalSteps}
            </p>
            <h2 className="text-3xl font-black text-foreground mb-1">Champion Invite</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Champions are verified leaders. Enter your invite code to continue.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setInviteError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleVerifyInvite(); }}
                  placeholder="e.g. SPINTV26"
                  className="w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 transition-all font-mono tracking-widest"
                  style={{ background: "var(--fill-soft)", border: "1px solid var(--border)" }}
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
                    ? "gradient-primary text-white hover:opacity-90 active:scale-[0.98]"
                    : "text-muted-foreground/60 cursor-not-allowed"
                )}
                style={inviteCode.trim() && !inviteLoading ? undefined : { background: "var(--fill-mid)" }}
              >
                {inviteLoading ? "Verifying..." : "Verify Code"} {!inviteLoading && <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        )}

        {step === "tier" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button
              onClick={() => setStep(role === "champion" ? "invite" : "role")}
              className="text-muted-foreground text-sm mb-6 text-left hover:text-foreground transition-colors flex items-center gap-1"
            >
              Back
            </button>
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--accent-foreground)" }}>
              Step {totalSteps} of {totalSteps}
            </p>
            <h2 className="text-3xl font-black text-foreground mb-1">You start in the 200 Club</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Everyone begins here — even pros. Ride this month and you&apos;ll be fast-tracked up the
              moment your verified Strava distance crosses the next club.
            </p>

            <div className="mb-6 rounded-2xl border border-[#ff4b35]/30 bg-[#ff4b35]/[0.08] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-foreground">The clubs</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["200 Club", "400 Club", "600 Club", "800 Club", "1000 Club"].map((club, i) => (
                  <span
                    key={club}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold border",
                      i === 0
                        ? "bg-[#ff4b35]/20 text-accent-foreground border-[#ff4b35]/40"
                        : "bg-foreground/[0.05] text-muted-foreground border-foreground/10"
                    )}
                  >
                    {club}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Promotion is immediate when you cross a threshold. Demotions only happen at month-end.
                No requests, no approvals — just verified kilometres.
              </p>
            </div>

            {/* Zone input for champions */}
            {role === "champion" && (
              <div className="mb-6">
                <label className="block text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">
                  Your Zone <span className="text-accent-foreground">*</span>
                </label>
                <input
                  type="text"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="e.g. Centurion, Paarl, Durban North"
                  className="w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 transition-all"
                  style={{ background: "var(--fill-soft)", border: "1px solid var(--border)" }}
                />
              </div>
            )}

            {/* Region picker for members */}
            {role !== "champion" && (
              <div className="mb-6">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">Your Region</p>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRegion(r)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        region === r
                          ? "border-[#ff4b35]/60 text-accent-foreground bg-[#ff4b35]/10"
                          : "border-foreground/10 text-muted-foreground hover:border-foreground/20"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboard consent - Strava compliance */}
            <button
              type="button"
              onClick={() => setLeaderboardConsent((v) => !v)}
              className="w-full flex items-start gap-3 text-left rounded-2xl border p-4 transition-all"
              style={{
                borderColor: leaderboardConsent ? "rgba(255,75,53,0.5)" : "var(--border)",
                background: leaderboardConsent ? "rgba(255,75,53,0.08)" : "var(--fill-soft)",
              }}
            >
              <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                style={{ borderColor: leaderboardConsent ? "#ff4b35" : "var(--muted-foreground)", background: leaderboardConsent ? "#ff4b35" : "transparent" }}>
                {leaderboardConsent && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground/85 leading-snug">
                  Show my progress in SpinTribe rankings
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  Other riders can see my name, monthly km and rank on the league, team and zone boards.
                  You can change this later from your profile.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRewardsExportConsent((v) => !v)}
              className="mt-3 w-full flex items-start gap-3 text-left rounded-2xl border p-4 transition-all"
              style={{
                borderColor: rewardsExportConsent ? "rgba(255,75,53,0.5)" : "var(--border)",
                background: rewardsExportConsent ? "rgba(255,75,53,0.08)" : "var(--fill-soft)",
              }}
            >
              <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                style={{ borderColor: rewardsExportConsent ? "#ff4b35" : "var(--muted-foreground)", background: rewardsExportConsent ? "#ff4b35" : "transparent" }}>
                {rewardsExportConsent && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground/85 leading-snug">
                  Include me in reward eligibility exports
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  Admins can export my name, Strava ID, selected league, monthly km, and completion status for Team Vitality reward administration.
                </p>
              </div>
            </button>

            <button
              onClick={handleFinish}
              disabled={(role === "champion" && !zone.trim()) || submitting}
              className={cn(
                "w-full rounded-2xl py-4 font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2",
                (role !== "champion" || zone.trim()) && !submitting
                  ? "gradient-primary text-white hover:opacity-90 active:scale-[0.98]"
                  : "text-muted-foreground/60 cursor-not-allowed"
              )}
              style={(role !== "champion" || zone.trim()) && !submitting ? undefined : { background: "var(--fill-mid)" }}
            >
              {submitting ? "Setting up..." : <>START CHALLENGE <ChevronRight size={16} /></>}
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
  icon,
  title,
  subtitle,
  bullets,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-foreground/10 bg-foreground/5 p-5 hover:border-foreground/20 transition-all active:scale-[0.99] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: `${accent}20` }}
        >
          {icon}
        </div>
        <div className="flex-1">
          <p className="font-black text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronRight size={18} className="text-muted-foreground/70" />
      </div>
      <ul className="space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: accent }} />
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}
