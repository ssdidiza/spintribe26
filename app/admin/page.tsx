"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import NavBar from "@/components/NavBar";
import FeedbackBoard from "@/components/FeedbackBoard";
import AdminLessonCalendar from "@/components/AdminLessonCalendar";
import AdminLessonAvailability from "@/components/AdminLessonAvailability";
import AdminLessonRideAttribution from "@/components/AdminLessonRideAttribution";
import { CHALLENGE_TIERS, OFFICIAL_REWARD_TIERS } from "@/lib/challenge";
import { formatCredits, formatMoneyCents } from "@/lib/lessons";
import { Tier, UserRole } from "@/lib/types";
import {
  Bell,
  Bike,
  CalendarCheck,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  MessageSquare,
  ShieldCheck,
  Star,
  Trophy,
  UserX,
  Users,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

type AdminTab = "riders" | "lessons" | "rewards" | "champing" | "notifications" | "feedback";

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

type AdminLessonSummary = {
  paidCredits: number;
  availableCredits: number;
  bookedCredits: number;
  completedCredits: number;
  forfeitedCredits: number;
  totalPaidCents: number;
  pendingAmountCents: number;
  pendingCredits: number;
  pendingPayments: number;
  xeroErrors: number;
};

type AdminLessonRider = {
  rider: {
    id: string;
    name: string;
    avatar: string | null;
  };
  summary: {
    paidCredits: number;
    availableCredits: number;
    bookedCredits: number;
    completedCredits: number;
    forfeitedCredits: number;
    totalPaidCents: number;
    pendingAmountCents: number;
    pendingCredits: number;
  };
};

type AdminLessonPurchase = {
  id: string;
  lessonCount: number;
  totalAmountCents: number;
  currency: string;
  status: "draft" | "pending_payment" | "paid" | "cancelled";
  xeroInvoiceNumber: string | null;
  xeroSyncStatus: string | null;
  xeroError: string | null;
  payfastCheckoutUrl: string | null;
  createdAt: string;
  rider: {
    id: string;
    name: string;
    avatar: string | null;
  };
};

type AdminLessonSession = {
  id: string;
  status: "pending_payment" | "booked" | "completed" | "cancelled" | "no_show" | "coach_cancelled";
  startsAt: string;
  durationMinutes: number;
  creditAmount: number;
  location: string | null;
  rider: {
    id: string;
    name: string;
    avatar: string | null;
  };
};

type AdminLessonsData = {
  summary: AdminLessonSummary;
  riders: AdminLessonRider[];
  purchases: AdminLessonPurchase[];
  sessions: AdminLessonSession[];
};

type AdminService = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
};

const EMPTY_ADMIN_LESSONS: AdminLessonsData = {
  summary: {
    paidCredits: 0,
    availableCredits: 0,
    bookedCredits: 0,
    completedCredits: 0,
    forfeitedCredits: 0,
    totalPaidCents: 0,
    pendingAmountCents: 0,
    pendingCredits: 0,
    pendingPayments: 0,
    xeroErrors: 0,
  },
  riders: [],
  purchases: [],
  sessions: [],
};

const ROLES: UserRole[] = ["member", "champion", "admin"];

const TAB_META: Record<AdminTab, { label: string; Icon: typeof Users }> = {
  riders: { label: "Riders", Icon: Users },
  lessons: { label: "Lessons", Icon: Bike },
  rewards: { label: "Rewards", Icon: Trophy },
  champing: { label: "Champing", Icon: Star },
  notifications: { label: "Comms", Icon: Bell },
  feedback: { label: "Feedback", Icon: MessageSquare },
};

function csvEscape(value: string | number | boolean | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function fetchWithTimeout(input: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readJsonOr<T>(response: Response | undefined, fallback: T): Promise<T> {
  if (!response?.ok) return fallback;
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

export default function AdminPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, completeOnboarding } = useStore();
  const currentUserId = currentUser?.id;
  const currentUserRole = currentUser?.role;
  const currentUserTier = currentUser?.tier;
  const currentUserZone = currentUser?.zone;
  const currentUserLeaderboardConsent = currentUser?.leaderboardConsent;
  const currentUserRewardsConsent = currentUser?.rewardsExportConsent;
  const currentUserOnboarded = currentUser?.onboarded;
  const [activeTab, setActiveTab] = useState<AdminTab>("riders");
  const [loading, setLoading] = useState(true);
  const [adminNotice, setAdminNotice] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [monthKey, setMonthKey] = useState("");
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [champing, setChamping] = useState<ChampingSession[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [lessons, setLessons] = useState<AdminLessonsData>(EMPTY_ADMIN_LESSONS);
  const [lessonUserId, setLessonUserId] = useState("");
  const [lessonCount, setLessonCount] = useState(1);
  const [lessonDiscount, setLessonDiscount] = useState(0);
  const [lessonEmail, setLessonEmail] = useState("");
  const [lessonAlreadyPaid, setLessonAlreadyPaid] = useState(false);
  const [lessonXeroInvoiceNumber, setLessonXeroInvoiceNumber] = useState("");
  const [lessonPaymentLink, setLessonPaymentLink] = useState("");
  const [lessonServices, setLessonServices] = useState<AdminService[]>([]);
  const [newService, setNewService] = useState({ name: "", durationMinutes: 60, priceRands: 399 });
  const [commTitle, setCommTitle] = useState("");
  const [commBody, setCommBody] = useState("");
  const hasRenderedAdminData = useRef(false);

  const loadAdminData = useCallback(async () => {
    if (!hasRenderedAdminData.current) setLoading(true);
    setAdminNotice("");

    try {
      const usersRes = await fetchWithTimeout("/api/admin/users");
      if (!usersRes.ok) {
        router.replace(usersRes.status === 401 ? "/" : "/dashboard");
        return;
      }

      const usersData = await readJsonOr<{ caller?: AdminCaller; users?: AdminUser[]; monthKey?: string }>(
        usersRes,
        { users: [] }
      );
      const caller = usersData.caller;
      const callerZone = caller?.zone ?? undefined;
      const callerLeaderboardConsent = caller?.leaderboard_consent ?? false;
      const callerRewardsConsent = caller?.rewards_export_consent ?? false;
      const shouldSyncLocalCaller = caller?.role === "admin" && currentUserId && (
        !isOnboarded ||
        currentUserRole !== caller.role ||
        currentUserTier !== caller.tier ||
        currentUserZone !== callerZone ||
        currentUserLeaderboardConsent !== callerLeaderboardConsent ||
        currentUserRewardsConsent !== callerRewardsConsent ||
        currentUserOnboarded !== true
      );
      if (shouldSyncLocalCaller) {
        completeOnboarding(
          caller.role,
          caller.tier,
          callerZone,
          callerLeaderboardConsent,
          callerRewardsConsent
        );
      }

      setUsers(usersData.users ?? []);

      const optionalResults = await Promise.allSettled([
        fetchWithTimeout("/api/admin/rewards"),
        fetchWithTimeout("/api/admin/champing"),
        fetchWithTimeout("/api/admin/notifications"),
        fetchWithTimeout("/api/admin/lessons"),
      ]);
      const optionalFailures = optionalResults.filter((result) => result.status === "rejected").length;
      const [rewardsRes, champingRes, notificationsRes, lessonsRes] = optionalResults.map((result) => (
        result.status === "fulfilled" ? result.value : undefined
      ));

      const [rewardsData, champingData, notificationsData, lessonsData] = await Promise.all([
        readJsonOr<{ monthKey?: string; rows?: RewardRow[] }>(rewardsRes, { rows: [] }),
        readJsonOr<{ sessions?: ChampingSession[] }>(champingRes, { sessions: [] }),
        readJsonOr<{ notifications?: AdminNotification[] }>(notificationsRes, { notifications: [] }),
        readJsonOr<AdminLessonsData>(lessonsRes, EMPTY_ADMIN_LESSONS),
      ]);

      setMonthKey(usersData.monthKey ?? rewardsData.monthKey ?? "");
      setRewards(rewardsData.rows ?? []);
      setChamping(champingData.sessions ?? []);
      setNotifications(notificationsData.notifications ?? []);
      setLessons(lessonsData);
      hasRenderedAdminData.current = true;

      const nonOkPanels = [rewardsRes, champingRes, notificationsRes, lessonsRes]
        .filter((response) => response && !response.ok).length;
      if (optionalFailures || nonOkPanels) {
        setAdminNotice("Some founder panels did not refresh. Feedback and loaded panels are still available.");
      }
    } catch {
      setAdminNotice("Founder console could not refresh. Check your connection, then retry.");
    } finally {
      setLoading(false);
    }
  }, [
    completeOnboarding,
    currentUserId,
    currentUserRole,
    currentUserTier,
    currentUserZone,
    currentUserLeaderboardConsent,
    currentUserRewardsConsent,
    currentUserOnboarded,
    isOnboarded,
    router,
  ]);

  const loadLessonServices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lessons/services", { cache: "no-store" });
      const data = await res.json().catch(() => ({})) as { services?: AdminService[] };
      if (res.ok) setLessonServices(data.services ?? []);
    } catch {
      // Service catalog is non-critical; the rest of the console still loads.
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUserId) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    const timer = window.setTimeout(() => {
      void loadAdminData();
      void loadLessonServices();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, currentUserId, isOnboarded, router, loadAdminData, loadLessonServices]);

  const founder = useMemo(
    () => users.find((user) => user.isCurrentUser),
    [users]
  );
  const eligibleRewards = rewards.filter((row) => row.eligibleForExport);
  const selectedLessonUserId = lessonUserId || users[0]?.stravaId || "";
  const upcomingLessons = lessons.sessions
    .filter((lessonSession) => lessonSession.status === "booked")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

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

  async function createLessonPackage() {
    if (!selectedLessonUserId || lessonCount <= 0) return;
    setSaving("lesson-package");
    setLessonPaymentLink("");
    setAdminNotice("");
    try {
      const createPayment = !lessonAlreadyPaid && Boolean(lessonEmail.trim());
      const response = await fetch("/api/lessons/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedLessonUserId,
          lessonCount,
          discountPercent: lessonDiscount,
          customerEmail: lessonEmail,
          createPayment,
          markPaid: lessonAlreadyPaid,
          syncXero: !lessonAlreadyPaid,
          xeroInvoiceNumber: lessonAlreadyPaid ? lessonXeroInvoiceNumber : "",
          description: "Cycling lesson package",
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        payment?: { authorizationUrl?: string } | null;
        xeroWarning?: string | null;
      };
      if (!response.ok) throw new Error(data.error || "Unable to create lesson package");

      const paymentLink = data.payment?.authorizationUrl ?? "";
      setLessonPaymentLink(paymentLink);
      await loadAdminData();
      setAdminNotice(
        lessonAlreadyPaid
          ? "Paid package imported and credits activated."
          : paymentLink
            ? "Package created. Copy the PayFast link below."
            : data.xeroWarning
              ? `Package saved. Xero needs review: ${data.xeroWarning}`
              : "Package saved as a draft."
      );
      setLessonAlreadyPaid(false);
      setLessonXeroInvoiceNumber("");
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Unable to create lesson package");
    } finally {
      setSaving(null);
    }
  }

  async function updateLessonSessionStatus(
    sessionId: string,
    status: "completed" | "no_show" | "coach_cancelled"
  ) {
    setSaving(sessionId);
    setAdminNotice("");
    try {
      const response = await fetch(`/api/lessons/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to update lesson");
      await loadAdminData();
      setAdminNotice(`Lesson marked ${status.replace("_", " ")}.`);
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Unable to update lesson");
    } finally {
      setSaving(null);
    }
  }

  async function copyLessonPaymentLink() {
    if (!lessonPaymentLink) return;
    await navigator.clipboard.writeText(lessonPaymentLink);
    setAdminNotice("PayFast payment link copied.");
  }

  function updateServiceField(id: string, patch: Partial<AdminService>) {
    setLessonServices((prev) => prev.map((service) => (service.id === id ? { ...service, ...patch } : service)));
  }

  async function saveService(service: AdminService) {
    setSaving(`service-${service.id}`);
    setAdminNotice("");
    try {
      const response = await fetch("/api/admin/lessons/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: service.id,
          name: service.name,
          description: service.description,
          durationMinutes: service.durationMinutes,
          priceCents: Math.round(service.priceCents),
          sortOrder: service.sortOrder,
          active: service.active,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save service");
      await loadLessonServices();
      setAdminNotice(`Saved "${service.name}".`);
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Unable to save service");
    } finally {
      setSaving(null);
    }
  }

  async function toggleService(service: AdminService) {
    setSaving(`service-${service.id}`);
    try {
      const response = await fetch("/api/admin/lessons/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: service.id, active: !service.active }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to update service");
      await loadLessonServices();
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Unable to update service");
    } finally {
      setSaving(null);
    }
  }

  async function createService() {
    if (newService.name.trim().length < 2) {
      setAdminNotice("Enter a service name.");
      return;
    }
    setSaving("service-new");
    setAdminNotice("");
    try {
      const response = await fetch("/api/admin/lessons/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newService.name,
          durationMinutes: newService.durationMinutes,
          priceCents: Math.round(newService.priceRands * 100),
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to add service");
      setNewService({ name: "", durationMinutes: 60, priceRands: 399 });
      await loadLessonServices();
      setAdminNotice("Service added.");
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Unable to add service");
    } finally {
      setSaving(null);
    }
  }

  async function deleteService(id: string, name: string) {
    setSaving(`service-${id}`);
    setAdminNotice("");
    try {
      const response = await fetch(`/api/admin/lessons/services?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to remove service");
      await loadLessonServices();
      setAdminNotice(`Removed "${name}".`);
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Unable to remove service");
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
      `${row.tier} Club`,
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
    <div className="min-h-screen bg-background mb-nav">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="gradient-primary w-8 h-8 rounded-xl flex items-center justify-center">
            <ShieldCheck size={15} color="#fff" />
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Founder Admin</p>
            <h1 className="font-bold text-foreground text-xl leading-tight">SpinTribe ops</h1>
          </div>
        </div>
        <span className="text-[10px] font-bold text-accent-foreground">{monthKey || "loading"}</span>
      </header>

      <main className="mx-auto w-full max-w-lg md:max-w-4xl px-5 py-6 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Riders", value: users.length, Icon: Users },
            { label: "Eligible", value: eligibleRewards.length, Icon: Trophy },
            { label: "Champing", value: champing.length, Icon: Star },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1"><Icon size={13} className="text-accent-foreground" /></div>
              <p className="text-lg font-bold text-foreground">{value}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {founder && (
          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-foreground mb-2">Founder admin status</p>
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
                  color: active ? "var(--accent-foreground)" : "var(--muted-foreground)",
                  borderColor: active ? "rgba(255,75,53,0.5)" : "var(--border)",
                  background: active ? "rgba(255,75,53,0.12)" : "var(--fill-soft)",
                }}
              >
                <Icon size={12} /> {label}
              </button>
            );
          })}
        </div>

        {adminNotice && (
          <div className="glass-card p-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground leading-snug">{adminNotice}</p>
            <button
              type="button"
              onClick={loadAdminData}
              className="flex-shrink-0 rounded-full border border-[#ff4b35]/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#ff4b35]"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">Loading founder console...</div>
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
                          <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                          {user.isCurrentUser && <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-foreground/15 text-foreground font-bold">YOU</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{user.monthlyKm} km this month - {user.activityCount} rides</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-accent-foreground">{user.tier} km</p>
                        <p className="text-[9px] text-muted-foreground">{user.tier} Club</p>
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

            {activeTab === "lessons" && (
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <MiniMetric label="Available" value={formatCredits(lessons.summary.availableCredits)} />
                  <MiniMetric label="Booked" value={formatCredits(lessons.summary.bookedCredits)} />
                  <MiniMetric label="Completed" value={formatCredits(lessons.summary.completedCredits)} />
                  <MiniMetric label="Pending pay" value={lessons.summary.pendingPayments} />
                </div>

                <AdminLessonAvailability />

                <AdminLessonRideAttribution riders={users.map((user) => ({ id: user.stravaId, name: user.name }))} />

                <div className="glass-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bike size={15} className="text-accent-foreground" />
                      <p className="text-sm font-black text-foreground">Public booking page</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(`${window.location.origin}/book`);
                        setAdminNotice("Booking link copied — share it with students.");
                      }}
                      className="rounded-lg border border-foreground/15 px-3 py-1.5 text-[10px] font-black text-accent-foreground"
                    >
                      Copy /book link
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Share <span className="font-bold text-foreground">{`${typeof window !== "undefined" ? window.location.host : "speradidiza.cc"}/book`}</span> — anyone can book and pay without a Strava account. The services below are what they see.
                  </p>
                </div>

                <div className="glass-card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CreditCard size={15} className="text-accent-foreground" />
                    <p className="text-sm font-black text-foreground">Services &amp; pricing</p>
                  </div>
                  {lessonServices.length === 0 ? (
                    <p className="mb-3 text-[11px] text-muted-foreground">No services yet. Add your first one below.</p>
                  ) : (
                    <div className="mb-3 space-y-2">
                      {lessonServices.map((service) => (
                        <div key={service.id} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                            <label className="col-span-2 block md:col-span-1">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Name</span>
                              <input
                                value={service.name}
                                onChange={(event) => updateServiceField(service.id, { name: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs font-bold text-foreground outline-none"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Minutes</span>
                              <input
                                type="number"
                                min={15}
                                max={480}
                                value={service.durationMinutes}
                                onChange={(event) => updateServiceField(service.id, { durationMinutes: Number(event.target.value) || 0 })}
                                className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs font-bold text-foreground outline-none"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Price (R)</span>
                              <input
                                type="number"
                                min={0}
                                step={10}
                                value={Math.round(service.priceCents) / 100}
                                onChange={(event) => updateServiceField(service.id, { priceCents: Math.round((Number(event.target.value) || 0) * 100) })}
                                className="mt-1 w-full rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs font-bold text-foreground outline-none"
                              />
                            </label>
                            <div className="col-span-2 flex items-end gap-1.5 md:col-span-1">
                              <button
                                type="button"
                                onClick={() => saveService(service)}
                                disabled={saving === `service-${service.id}`}
                                className="flex-1 rounded-lg bg-[#ff4b35] px-2.5 py-2 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleService(service)}
                                disabled={saving === `service-${service.id}`}
                                title={service.active ? "Hide from booking page" : "Show on booking page"}
                                className="rounded-lg border border-foreground/15 px-2.5 py-2 text-[10px] font-black text-muted-foreground disabled:opacity-50"
                              >
                                {service.active ? "Live" : "Hidden"}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteService(service.id, service.name)}
                                disabled={saving === `service-${service.id}`}
                                aria-label="Delete service"
                                className="rounded-lg border border-foreground/15 px-2.5 py-2 text-[10px] font-black text-red-500 disabled:opacity-50"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 border-t border-foreground/10 pt-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                    <input
                      value={newService.name}
                      onChange={(event) => setNewService((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="New service name"
                      className="col-span-2 rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 md:col-span-1"
                    />
                    <input
                      type="number"
                      min={15}
                      max={480}
                      value={newService.durationMinutes}
                      onChange={(event) => setNewService((prev) => ({ ...prev, durationMinutes: Number(event.target.value) || 0 }))}
                      placeholder="Minutes"
                      className="rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs text-foreground outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={newService.priceRands}
                      onChange={(event) => setNewService((prev) => ({ ...prev, priceRands: Number(event.target.value) || 0 }))}
                      placeholder="Price (R)"
                      className="rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs text-foreground outline-none"
                    />
                    <button
                      type="button"
                      onClick={createService}
                      disabled={saving === "service-new"}
                      className="col-span-2 rounded-lg border border-[#ff4b35]/45 bg-[#ff4b35]/10 px-2.5 py-2 text-[10px] font-black text-accent-foreground disabled:opacity-50 md:col-span-1"
                    >
                      Add service
                    </button>
                  </div>
                </div>

                <div className="glass-card p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <CreditCard size={15} className="text-accent-foreground" />
                    <div>
                      <p className="text-sm font-black text-foreground">Create lesson package</p>
                      <p className="text-[10px] text-muted-foreground">{formatMoneyCents(39900)} per hour</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <label className="col-span-2 block">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Rider</span>
                      <select
                        value={selectedLessonUserId}
                        onChange={(event) => setLessonUserId(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-xs font-bold text-foreground outline-none"
                      >
                        {users.map((user) => (
                          <option key={user.stravaId} value={user.stravaId}>{user.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Lessons</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={lessonCount}
                        onChange={(event) => setLessonCount(Math.max(1, Number(event.target.value) || 1))}
                        className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-xs font-bold text-foreground outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Discount %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={lessonDiscount}
                        onChange={(event) => setLessonDiscount(Math.min(100, Math.max(0, Number(event.target.value) || 0)))}
                        className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-xs font-bold text-foreground outline-none"
                      />
                    </label>
                    <label className="col-span-2 block md:col-span-3">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Payment email</span>
                      <input
                        type="email"
                        value={lessonEmail}
                        disabled={lessonAlreadyPaid}
                        onChange={(event) => setLessonEmail(event.target.value)}
                        placeholder={lessonAlreadyPaid ? "Not required for paid import" : "Client email for PayFast"}
                        className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={lessonAlreadyPaid}
                        onChange={(event) => setLessonAlreadyPaid(event.target.checked)}
                        className="h-4 w-4 accent-[#ff4b35]"
                      />
                      <span className="text-[10px] font-bold text-foreground">Already paid</span>
                    </label>
                    {lessonAlreadyPaid && (
                      <label className="col-span-2 block md:col-span-4">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Existing Xero invoice</span>
                        <input
                          value={lessonXeroInvoiceNumber}
                          onChange={(event) => setLessonXeroInvoiceNumber(event.target.value)}
                          placeholder="INV-1074"
                          className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
                        />
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={createLessonPackage}
                    disabled={!selectedLessonUserId || saving === "lesson-package"}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b35] px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                  >
                    <CreditCard size={14} />
                    {lessonAlreadyPaid ? "Import paid package" : lessonEmail.trim() ? "Create PayFast link" : "Create invoice draft"}
                  </button>
                  {lessonPaymentLink && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        readOnly
                        value={lessonPaymentLink}
                        className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5 text-[10px] text-muted-foreground outline-none"
                      />
                      <button
                        type="button"
                        title="Copy PayFast payment link"
                        aria-label="Copy PayFast payment link"
                        onClick={copyLessonPaymentLink}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[#ff4b35]/40 text-accent-foreground"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <AdminLessonCalendar sessions={upcomingLessons} />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Upcoming lessons</p>
                    <span className="text-[10px] font-bold text-accent-foreground">{upcomingLessons.length}</span>
                  </div>
                  {upcomingLessons.length === 0 ? (
                    <EmptyState text="No booked lessons." />
                  ) : (
                    <div className="space-y-2">
                      {upcomingLessons.map((lessonSession) => (
                        <div key={lessonSession.id} className="glass-card p-4">
                          <div className="flex items-start gap-3">
                            <CalendarCheck size={16} className="mt-0.5 flex-shrink-0 text-accent-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-foreground">{lessonSession.rider.name}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {format(new Date(lessonSession.startsAt), "EEE, d MMM - HH:mm")} - {lessonSession.durationMinutes} min
                              </p>
                              {lessonSession.location && (
                                <p className="mt-1 truncate text-[10px] text-muted-foreground">{lessonSession.location}</p>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={saving === lessonSession.id}
                              onClick={() => updateLessonSessionStatus(lessonSession.id, "completed")}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[9px] font-black text-emerald-600 disabled:opacity-40"
                            >
                              <CheckCircle2 size={11} /> Complete
                            </button>
                            <button
                              type="button"
                              disabled={saving === lessonSession.id}
                              onClick={() => updateLessonSessionStatus(lessonSession.id, "no_show")}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[9px] font-black text-amber-600 disabled:opacity-40"
                            >
                              <UserX size={11} /> No-show
                            </button>
                            <button
                              type="button"
                              disabled={saving === lessonSession.id}
                              onClick={() => updateLessonSessionStatus(lessonSession.id, "coach_cancelled")}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2 text-[9px] font-black text-red-600 disabled:opacity-40"
                            >
                              <XCircle size={11} /> Cancel
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Client balances</p>
                    <span className="text-[10px] font-bold text-muted-foreground">{lessons.riders.length}</span>
                  </div>
                  {lessons.riders.length === 0 ? (
                    <EmptyState text="No lesson clients yet." />
                  ) : (
                    <div className="space-y-2">
                      {lessons.riders.map((row) => (
                        <div key={row.rider.id} className="glass-card flex items-center gap-3 p-4">
                          <Bike size={15} className="text-accent-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-foreground">{row.rider.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatCredits(row.summary.bookedCredits)} booked - {formatCredits(row.summary.completedCredits)} completed
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-accent-foreground">{formatCredits(row.summary.availableCredits)}</p>
                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">available</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Recent packages</p>
                    <span className="text-[10px] font-bold text-muted-foreground">{lessons.purchases.length}</span>
                  </div>
                  {lessons.purchases.length === 0 ? (
                    <EmptyState text="No lesson packages yet." />
                  ) : (
                    <div className="space-y-2">
                      {lessons.purchases.slice(0, 15).map((purchase) => (
                        <div key={purchase.id} className="glass-card flex items-center gap-3 p-4">
                          <CreditCard size={15} className="text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-foreground">
                              {purchase.rider.name} - {formatCredits(purchase.lessonCount)} lessons
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {formatMoneyCents(purchase.totalAmountCents, purchase.currency)}
                              {purchase.xeroInvoiceNumber ? ` - ${purchase.xeroInvoiceNumber}` : ""}
                              {purchase.xeroSyncStatus === "error" ? " - Xero sync error" : ""}
                            </p>
                          </div>
                          <StatusPill label={purchase.status.replace("_", " ")} active={purchase.status === "paid"} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === "rewards" && (
              <section className="space-y-3">
                <div className="glass-card p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-foreground">Rewards export</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Completion-based, consented riders only. Official reward leagues: {OFFICIAL_REWARD_TIERS.join(", ")} km.</p>
                  </div>
                  <button onClick={exportRewardsCsv} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-white bg-[#ff4b35]">
                    <Download size={13} /> Export
                  </button>
                </div>
                {rewards.map((row) => (
                  <div key={row.stravaId} className="glass-card p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{row.name}</p>
                      <p className="text-[10px] text-muted-foreground">{row.tier} Club - outdoor {row.outdoorKm} km - indoor {row.indoorKm} km</p>
                    </div>
                    <StatusPill label={row.eligibleForExport ? "export" : row.complete ? "complete" : "not yet"} active={row.eligibleForExport} />
                    {row.overTierReview && <StatusPill label="upgrade" active />}
                  </div>
                ))}
              </section>
            )}

            {activeTab === "champing" && (
              <section className="space-y-2">
                {champing.length === 0 ? <EmptyState text="No champing check-ins logged yet." /> : champing.map((session) => (
                  <div key={session.id} className="glass-card p-4 flex items-center gap-3">
                    <Star size={16} className="text-accent-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{session.userName}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(session.date), "MMM d, yyyy")} - {session.zoneName || "No zone"} - {session.stravaActivityKm ?? 0} km</p>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {activeTab === "notifications" && (
              <section className="space-y-3">
                <div className="glass-card p-4 space-y-2">
                  <input value={commTitle} onChange={(e) => setCommTitle(e.target.value)} placeholder="Message title" className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70" />
                  <textarea value={commBody} onChange={(e) => setCommBody(e.target.value)} placeholder="Message body" rows={3} className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm text-foreground outline-none resize-none placeholder:text-muted-foreground/70" />
                  <button onClick={sendNotification} disabled={saving === "notification"} className="w-full rounded-xl py-2 text-xs font-bold text-white bg-[#ff4b35] disabled:opacity-50">Send to onboarded riders</button>
                </div>
                {notifications.slice(0, 10).map((notification) => (
                  <div key={notification.id} className="glass-card p-4">
                    <p className="text-sm font-bold text-foreground">{notification.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{notification.body}</p>
                    <p className="text-[9px] text-muted-foreground/60 mt-2">{format(new Date(notification.created_at), "MMM d, HH:mm")}</p>
                  </div>
                ))}
              </section>
            )}

            {activeTab === "feedback" && (
              <FeedbackBoard admin />
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
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.04] p-3">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black text-foreground">{value}</p>
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
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-2 py-2 text-xs font-bold text-foreground outline-none"
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
        borderColor: active ? "rgba(255,75,53,0.45)" : "var(--border)",
        background: active ? "rgba(255,75,53,0.12)" : "var(--fill-soft)",
      }}
    >
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-black text-foreground">{active ? "enabled" : "off"}</p>
    </button>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
      style={{
        color: active ? "#ff4b35" : "var(--muted-foreground)",
        border: `1px solid ${active ? "rgba(255,75,53,0.45)" : "var(--border)"}`,
        background: active ? "rgba(255,75,53,0.12)" : "var(--fill-soft)",
      }}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="glass-card p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
