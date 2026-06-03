"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import NavBar from "@/components/NavBar";
import { CHALLENGE_TIERS, OFFICIAL_REWARD_TIERS } from "@/lib/challenge";
import { Tier, TIER_LABELS, UserRole } from "@/lib/types";
import {
  Bell,
  Check,
  ClipboardList,
  Download,
  MessageSquare,
  ShieldCheck,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";

type AdminTab = "riders" | "rewards" | "upgrades" | "champing" | "notifications" | "feedback";

type AdminUser = {
  id: string;
  stravaId: string;
  name: string;
  avatar?: string;
  role: UserRole;
  tier: Tier;
  onboarded: boolean;
  zone?: string;
  country?: string;
  leaderboardConsent: boolean;
  rewardsExportConsent: boolean;
  lastStravaSyncAt?: string;
  createdAt?: string;
  isCurrentUser: boolean;
  monthlyKm: number;
  indoorKm: number;
  outdoorKm: number;
  activityCount: number;
};

type RewardRow = {
  stravaId: string;
  name: string;
  role: UserRole;
  tier: Tier;
  zone?: string;
  totalKm: number;
  outdoorKm: number;
  indoorKm: number;
  complete: boolean;
  consent: boolean;
  officialRewardTier: boolean;
  eligibleForExport: boolean;
  overTierReview: boolean;
};

type UpgradeRequest = {
  id: string;
  userName: string;
  avatar?: string;
  currentTier: Tier;
  requestedTier: Tier;
  monthKey: string;
  monthlyKm: number;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  effectiveOn: string;
  adminNote?: string;
};

type ChampingSession = {
  id: string;
  userName: string;
  type: string;
  date: string;
  zoneName?: string;
  stravaActivityName?: string;
  stravaActivityKm?: number;
};

type AdminNotification = {
  id: number;
  user_strava_id: string;
  title: string;
  body: string;
  created_at: string;
};

type AdminCaller = {
  role: UserRole;
  tier: Tier;
  zone?: string;
  leaderboard_consent?: boolean;
  rewards_export_consent?: boolean;
};

const ROLES: UserRole[] = ["member", "champion", "admin"];

const TAB_META: Record<AdminTab, { label: string; Icon: typeof Users }> = {
  riders: { label: "Riders", Icon: Users },
  rewards: { label: "Rewards", Icon: Trophy },
  upgrades: { label: "Upgrades", Icon: ClipboardList },
  champing: { label: "Champing", Icon: Star },
  notifications: { label: "Comms", Icon: Bell },
  feedback: { label: "Feedback", Icon: MessageSquare },
};

function csvEscape(value: string | number | boolean | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, completeOnboarding } = useStore();
  const [activeTab, setActiveTab] = useState<AdminTab>("riders");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [monthKey, setMonthKey] = useState("");
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [upgrades, setUpgrades] = useState<UpgradeRequest[]>([]);
  const [champing, setChamping] = useState<ChampingSession[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [commTitle, setCommTitle] = useState("");
  const [commBody, setCommBody] = useState("");

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    const [usersRes, rewardsRes, upgradesRes, champingRes, notificationsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/rewards"),
      fetch("/api/admin/tier-upgrades"),
      fetch("/api/admin/champing"),
      fetch("/api/admin/notifications"),
    ]);

    if (!usersRes.ok) {
      setLoading(false);
      router.replace(usersRes.status === 401 ? "/" : "/dashboard");
      return;
    }

    const [usersData, rewardsData, upgradesData, champingData, notificationsData] = await Promise.all([
      usersRes.json(),
      rewardsRes.ok ? rewardsRes.json() : Promise.resolve({ rows: [] }),
      upgradesRes.ok ? upgradesRes.json() : Promise.resolve({ requests: [] }),
      champingRes.ok ? champingRes.json() : Promise.resolve({ sessions: [] }),
      notificationsRes.ok ? notificationsRes.json() : Promise.resolve({ notifications: [] }),
    ]);

    const caller = usersData.caller as AdminCaller | undefined;
    if (caller?.role === "admin") {
      completeOnboarding(
        caller.role,
        caller.tier,
        caller.zone,
        caller.leaderboard_consent ?? false,
        caller.rewards_export_consent ?? false
      );
    }

    setUsers(usersData.users ?? []);
    setMonthKey(usersData.monthKey ?? rewardsData.monthKey ?? "");
    setRewards(rewardsData.rows ?? []);
    setUpgrades(upgradesData.requests ?? []);
    setChamping(champingData.sessions ?? []);
    setNotifications(notificationsData.notifications ?? []);
    setLoading(false);
  }, [completeOnboarding, router]);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    const timer = window.setTimeout(() => { void loadAdminData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, currentUser, isOnboarded, router, loadAdminData]);

  const founder = useMemo(
    () => users.find((user) => user.isCurrentUser),
    [users]
  );
  const pendingUpgrades = upgrades.filter((request) => request.status === "pending");
  const eligibleRewards = rewards.filter((row) => row.eligibleForExport);

  async function patchUser(stravaId: string, patch: Record<string, unknown>) {
    setSaving(stravaId);
    try {
      const res = await fetch(`/api/admin/users/${stravaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) await loadAdminData();
    } finally {
      setSaving(null);
    }
  }

  async function decideUpgrade(id: string, status: "approved" | "rejected") {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/tier-upgrades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await loadAdminData();
    } finally {
      setSaving(null);
    }
  }

  async function sendNotification() {
    if (!commTitle.trim() || !commBody.trim()) return;
    setSaving("notification");
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: commTitle, body: commBody }),
      });
      if (res.ok) {
        setCommTitle("");
        setCommBody("");
        await loadAdminData();
      }
    } finally {
      setSaving(null);
    }
  }

  function exportRewardsCsv() {
    const headers = [
      "month",
      "rider_name",
      "strava_id",
      "league",
      "total_km",
      "outdoor_km",
      "indoor_km",
      "completion_status",
      "over_tier_review",
      "rewards_export_consent",
    ];
    const rows = eligibleRewards.map((row) => [
      monthKey,
      row.name,
      row.stravaId,
      `${row.tier} km ${TIER_LABELS[row.tier]}`,
      row.totalKm,
      row.outdoorKm,
      row.indoorKm,
      row.complete ? "complete" : "incomplete",
      row.overTierReview,
      row.consent,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spera-rewards-${monthKey || "month"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated || !currentUser) return null;

  return (
    <div className="min-h-screen bg-[#020202] mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#ff4b35,#ffffff)" }}>
            <ShieldCheck size={15} color="#fff" />
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#b8b8b8]">Founder Admin</p>
            <h1 className="font-bold text-[#ffffff] text-xl leading-tight">spera ops</h1>
          </div>
        </div>
        <span className="text-[10px] font-bold text-[#ff4b35]">{monthKey || "loading"}</span>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-4xl px-5 py-6 space-y-5">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Riders", value: users.length, Icon: Users },
            { label: "Eligible", value: eligibleRewards.length, Icon: Trophy },
            { label: "Pending", value: pendingUpgrades.length, Icon: ClipboardList },
            { label: "Champing", value: champing.length, Icon: Star },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1"><Icon size={13} className="text-[#ff4b35]" /></div>
              <p className="text-lg font-bold text-[#ffffff]">{value}</p>
              <p className="text-[9px] text-[#b8b8b8] uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {founder && (
          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35] mb-2">Founder admin status</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniMetric label="League" value={`${founder.tier} km`} />
              <MiniMetric label="Monthly km" value={founder.monthlyKm} />
              <MiniMetric label="Rewards consent" value={founder.rewardsExportConsent ? "yes" : "no"} />
              <MiniMetric label="Last sync" value={founder.lastStravaSyncAt ? format(new Date(founder.lastStravaSyncAt), "MMM d") : "-"} />
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(Object.keys(TAB_META) as AdminTab[]).map((tab) => {
            const { label, Icon } = TAB_META[tab];
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold border transition-all"
                style={{
                  color: active ? "#ff4b35" : "#b8b8b8",
                  borderColor: active ? "rgba(255,75,53,0.5)" : "rgba(255,255,255,0.1)",
                  background: active ? "rgba(255,75,53,0.12)" : "rgba(255,255,255,0.03)",
                }}
              >
                <Icon size={12} /> {label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="glass-card p-8 text-center text-sm text-[#b8b8b8]">Loading founder console...</div>
        ) : (
          <>
            {activeTab === "riders" && (
              <section className="space-y-2">
                {users.map((user) => (
                  <div key={user.stravaId} className="glass-card p-4">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-[#ffffff] truncate">{user.name}</p>
                          {user.isCurrentUser && <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-white/15 text-white font-bold">YOU</span>}
                        </div>
                        <p className="text-[10px] text-[#b8b8b8]">{user.monthlyKm} km this month - {user.activityCount} rides</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#ff4b35]">{user.tier} km</p>
                        <p className="text-[9px] text-[#b8b8b8]">{TIER_LABELS[user.tier]}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                      <SelectControl
                        label="Role"
                        value={user.role}
                        options={ROLES}
                        onChange={(value) => patchUser(user.stravaId, { role: value })}
                        disabled={saving === user.stravaId}
                      />
                      <SelectControl
                        label="League"
                        value={String(user.tier)}
                        options={CHALLENGE_TIERS.map(String)}
                        onChange={(value) => patchUser(user.stravaId, { tier: Number(value) })}
                        disabled={saving === user.stravaId}
                      />
                      <ToggleButton
                        label="Leaderboard"
                        active={user.leaderboardConsent}
                        onClick={() => patchUser(user.stravaId, { leaderboardConsent: !user.leaderboardConsent })}
                      />
                      <ToggleButton
                        label="Rewards export"
                        active={user.rewardsExportConsent}
                        onClick={() => patchUser(user.stravaId, { rewardsExportConsent: !user.rewardsExportConsent })}
                      />
                    </div>
                  </div>
                ))}
              </section>
            )}

            {activeTab === "rewards" && (
              <section className="space-y-3">
                <div className="glass-card p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35]">Rewards export</p>
                    <p className="text-[11px] text-[#b8b8b8] mt-1">Completion-based, consented riders only. Official reward leagues: {OFFICIAL_REWARD_TIERS.join(", ")} km.</p>
                  </div>
                  <button onClick={exportRewardsCsv} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-white bg-[#ff4b35]">
                    <Download size={13} /> Export
                  </button>
                </div>
                {rewards.map((row) => (
                  <div key={row.stravaId} className="glass-card p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#ffffff] truncate">{row.name}</p>
                      <p className="text-[10px] text-[#b8b8b8]">{row.tier} km {TIER_LABELS[row.tier]} - outdoor {row.outdoorKm} km - indoor {row.indoorKm} km</p>
                    </div>
                    <StatusPill label={row.eligibleForExport ? "export" : row.complete ? "complete" : "not yet"} active={row.eligibleForExport} />
                    {row.overTierReview && <StatusPill label="upgrade" active />}
                  </div>
                ))}
              </section>
            )}

            {activeTab === "upgrades" && (
              <section className="space-y-2">
                {upgrades.length === 0 ? <EmptyState text="No league upgrade requests yet." /> : upgrades.map((request) => (
                  <div key={request.id} className="glass-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#ffffff]">{request.userName}</p>
                        <p className="text-[10px] text-[#b8b8b8]">{request.currentTier} km to {request.requestedTier} km - {request.monthlyKm} km in {request.monthKey}</p>
                        <p className="text-[10px] text-[#b8b8b8]/60">Effective {request.effectiveOn}</p>
                      </div>
                      <StatusPill label={request.status} active={request.status === "approved"} />
                    </div>
                    {request.status === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => decideUpgrade(request.id, "approved")} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white bg-emerald-500/80">
                          <Check size={13} /> Approve
                        </button>
                        <button onClick={() => decideUpgrade(request.id, "rejected")} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-[#ffb4ab] border border-red-500/30">
                          <X size={13} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {activeTab === "champing" && (
              <section className="space-y-2">
                {champing.length === 0 ? <EmptyState text="No champing sessions logged yet." /> : champing.map((session) => (
                  <div key={session.id} className="glass-card p-4 flex items-center gap-3">
                    <Star size={16} className="text-[#ff4b35]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#ffffff] truncate">{session.userName}</p>
                      <p className="text-[10px] text-[#b8b8b8]">{format(new Date(session.date), "MMM d, yyyy")} - {session.zoneName || "No zone"} - {session.stravaActivityKm ?? 0} km</p>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {activeTab === "notifications" && (
              <section className="space-y-3">
                <div className="glass-card p-4 space-y-2">
                  <input value={commTitle} onChange={(e) => setCommTitle(e.target.value)} placeholder="Message title" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
                  <textarea value={commBody} onChange={(e) => setCommBody(e.target.value)} placeholder="Message body" rows={3} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none resize-none" />
                  <button onClick={sendNotification} disabled={saving === "notification"} className="w-full rounded-xl py-2 text-xs font-bold text-white bg-[#ff4b35] disabled:opacity-50">Send to onboarded riders</button>
                </div>
                {notifications.slice(0, 10).map((notification) => (
                  <div key={notification.id} className="glass-card p-4">
                    <p className="text-sm font-bold text-[#ffffff]">{notification.title}</p>
                    <p className="text-[11px] text-[#b8b8b8] mt-1">{notification.body}</p>
                    <p className="text-[9px] text-[#b8b8b8]/50 mt-2">{format(new Date(notification.created_at), "MMM d, HH:mm")}</p>
                  </div>
                ))}
              </section>
            )}

            {activeTab === "feedback" && (
              <section className="glass-card p-5">
                <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#ff4b35] mb-2">Beta feedback</p>
                <p className="text-sm text-[#b8b8b8] leading-relaxed">Feedback currently routes through the Profile mailto flow. Use this tab as the ops reminder to triage bugs, confusing screens, champ flows, and launch ideas from the first testers.</p>
                <a href="mailto:ssdidiza@gmail.com?subject=spera beta feedback triage" className="mt-4 inline-flex rounded-full px-4 py-2 text-xs font-bold text-white bg-[#ff4b35]">Open feedback inbox</a>
              </section>
            )}
          </>
        )}
      </main>
      <NavBar />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8]">{label}</p>
      <p className="mt-1 text-sm font-black text-[#ffffff]">{value}</p>
    </div>
  );
}

function SelectControl({ label, value, options, onChange, disabled }: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-[#b8b8b8]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-white/10 bg-[#111] px-2 py-2 text-xs font-bold text-white outline-none"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border px-3 py-2 text-left transition-colors"
      style={{
        borderColor: active ? "rgba(255,75,53,0.45)" : "rgba(255,255,255,0.1)",
        background: active ? "rgba(255,75,53,0.12)" : "rgba(255,255,255,0.04)",
      }}
    >
      <p className="text-[9px] uppercase tracking-wider text-[#b8b8b8]">{label}</p>
      <p className="text-xs font-black text-white">{active ? "enabled" : "off"}</p>
    </button>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
      style={{
        color: active ? "#ff4b35" : "#b8b8b8",
        border: `1px solid ${active ? "rgba(255,75,53,0.45)" : "rgba(255,255,255,0.12)"}`,
        background: active ? "rgba(255,75,53,0.12)" : "rgba(255,255,255,0.04)",
      }}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="glass-card p-8 text-center text-sm text-[#b8b8b8]">{text}</div>;
}
