"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getMonthlyKm } from "@/lib/mock-data";
import NavBar from "@/components/NavBar";
import { TIER_LABELS, Tier, UserRole, hasAdminRole, canAccessChampionFeatures } from "@/lib/types";
import { ShieldCheck, Users, Zap, MapPin, ChevronDown, Check, X, Calendar, TrendingUp } from "lucide-react";
import { format } from "date-fns";

const ROLES: UserRole[] = ["member", "champion", "admin"];
const TIERS: Tier[] = [200, 400, 800, 1000];

const ROLE_COLORS: Record<UserRole, string> = {
  member:   "#cac3d8",
  champion: "#cdbdff",
  admin:    "#00e3fd",
};

export default function AdminPage() {
  const router   = useRouter();
  const hydrated = useHydrated();
  const { currentUser, isOnboarded, users, activities, championSessions, zones } = useStore();

  const [saving, setSaving]     = useState<string | null>(null);
  const [saved, setSaved]       = useState<string | null>(null);
  const [editUser, setEditUser] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, UserRole>>({});
  const [pendingTier, setPendingTier] = useState<Record<string, Tier>>({});
  const [activeTab, setActiveTab] = useState<"users" | "sessions" | "zones">("users");

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.replace("/"); return; }
    if (!isOnboarded) { router.replace("/onboarding"); return; }
    if (!hasAdminRole(currentUser)) { router.replace("/dashboard"); return; }
  }, [hydrated, currentUser, isOnboarded, router]);

  if (!hydrated || !currentUser || !hasAdminRole(currentUser)) return null;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sessionsThisMonth = championSessions.filter((s) => s.date.startsWith(thisMonth));
  const activeRiders = users.filter((u) => u.isConnected && activities.some((a) => a.userId === u.id && a.date.startsWith(thisMonth)));
  const champUsers   = users.filter((u) => canAccessChampionFeatures(u));

  // ── Role / tier save ───────────────────────────────────────────────────────
  async function handleSave(userId: string, stravaId: string) {
    const role = pendingRole[userId];
    const tier = pendingTier[userId];
    if (!role && !tier) { setEditUser(null); return; }

    setSaving(userId);
    try {
      const res = await fetch(`/api/admin/users/${stravaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, tier }),
      });
      if (res.ok) {
        setSaved(userId);
        setTimeout(() => setSaved(null), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
      setEditUser(null);
      setPendingRole((p) => { const n = { ...p }; delete n[userId]; return n; });
      setPendingTier((p) => { const n = { ...p }; delete n[userId]; return n; });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#131313] mb-nav">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #7c4dff, #00e3fd)" }}>
          <ShieldCheck size={15} color="#fff" />
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">Admin Console</p>
          <h1 className="font-bold text-[#e5e2e1] text-xl leading-tight">SpinTribe26</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6 space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Users",    value: users.filter((u) => u.isConnected).length, icon: <Users size={13} className="text-[#cdbdff]" /> },
            { label: "Champs",   value: champUsers.length,                          icon: <Zap size={13} className="text-[#cdbdff]" /> },
            { label: "Sessions", value: sessionsThisMonth.length,                   icon: <Calendar size={13} className="text-[#00e3fd]" /> },
            { label: "Active",   value: activeRiders.length,                        icon: <TrendingUp size={13} className="text-[#00e3fd]" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="glass-card p-3 text-center">
              <div className="flex justify-center mb-1">{icon}</div>
              <p className="text-lg font-bold text-[#e5e2e1]">{value}</p>
              <p className="text-[9px] text-[#cac3d8] uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(["users", "sessions", "zones"] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 rounded-xl py-2 text-[11px] font-semibold border transition-all"
                style={active ? {
                  background: "rgba(124,77,255,0.15)",
                  borderColor: "rgba(124,77,255,0.5)",
                  color: "#cdbdff",
                } : {
                  background: "transparent",
                  borderColor: "rgba(255,255,255,0.08)",
                  color: "#cac3d8",
                }}>
                {tab === "users" ? "Users" : tab === "sessions" ? "Sessions" : "Zones"}
              </button>
            );
          })}
        </div>

        {/* ── USERS TAB ───────────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <section className="space-y-2">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
              {users.filter((u) => u.isConnected).length} registered riders
            </p>
            {users.filter((u) => u.isConnected).map((u) => {
              const isEditing = editUser === u.id;
              const currentRole = pendingRole[u.id] ?? u.role;
              const currentTier = pendingTier[u.id] ?? u.tier;
              const monthKm = getMonthlyKm(u.id, activities);
              const isSelf = u.id === currentUser.id;

              return (
                <div key={u.id} className="glass-card overflow-hidden transition-all"
                  style={isSelf ? { borderColor: "rgba(0,227,253,0.3)" } : undefined}>
                  {/* User row */}
                  <div className="flex items-center gap-3 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.avatar} alt={u.name}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      style={{ border: "1.5px solid rgba(124,77,255,0.4)" }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#e5e2e1] truncate">{u.name}</p>
                        {isSelf && (
                          <span className="text-[9px] rounded-full px-1.5 py-0.5 font-bold"
                            style={{ background: "rgba(0,227,253,0.15)", color: "#00e3fd" }}>YOU</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-semibold" style={{ color: ROLE_COLORS[u.role] }}>
                          {u.role.toUpperCase()}
                        </span>
                        <span className="text-[#cac3d8]/40 text-[10px]">·</span>
                        <span className="text-[10px] text-[#cac3d8]">{TIER_LABELS[u.tier]} · {u.tier} km</span>
                        {u.region && (
                          <>
                            <span className="text-[#cac3d8]/40 text-[10px]">·</span>
                            <span className="text-[10px] text-[#cac3d8]">{u.region}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* km + edit toggle */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#cdbdff]">{monthKm}</p>
                        <p className="text-[9px] text-[#cac3d8]">km</p>
                      </div>
                      {!isSelf && (
                        <button
                          onClick={() => setEditUser(isEditing ? null : u.id)}
                          className="w-7 h-7 rounded-lg glass flex items-center justify-center transition-colors hover:bg-white/10"
                        >
                          <ChevronDown size={12} className="text-[#cac3d8]"
                            style={{ transform: isEditing ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline editor */}
                  {isEditing && (
                    <div className="border-t border-white/[0.06] p-4 space-y-3">
                      {/* Role selector */}
                      <div>
                        <p className="text-[10px] text-[#cac3d8] uppercase tracking-wider mb-2">Role</p>
                        <div className="flex gap-2">
                          {ROLES.map((r) => (
                            <button key={r} onClick={() => setPendingRole((p) => ({ ...p, [u.id]: r }))}
                              className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold border transition-all"
                              style={currentRole === r ? {
                                background: "rgba(124,77,255,0.2)",
                                borderColor: "rgba(124,77,255,0.6)",
                                color: ROLE_COLORS[r],
                              } : {
                                background: "transparent",
                                borderColor: "rgba(255,255,255,0.08)",
                                color: "#cac3d8",
                              }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tier selector */}
                      <div>
                        <p className="text-[10px] text-[#cac3d8] uppercase tracking-wider mb-2">Tier</p>
                        <div className="flex gap-2">
                          {TIERS.map((t) => (
                            <button key={t} onClick={() => setPendingTier((p) => ({ ...p, [u.id]: t }))}
                              className="flex-1 rounded-lg py-1.5 text-[10px] font-semibold border transition-all"
                              style={currentTier === t ? {
                                background: "rgba(0,227,253,0.12)",
                                borderColor: "rgba(0,227,253,0.4)",
                                color: "#00e3fd",
                              } : {
                                background: "transparent",
                                borderColor: "rgba(255,255,255,0.08)",
                                color: "#cac3d8",
                              }}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Save / cancel */}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setEditUser(null); setPendingRole((p) => { const n = {...p}; delete n[u.id]; return n; }); setPendingTier((p) => { const n = {...p}; delete n[u.id]; return n; }); }}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 border border-white/10 text-[11px] font-semibold text-[#cac3d8] transition-colors hover:bg-white/5">
                          <X size={12} /> Cancel
                        </button>
                        <button
                          onClick={() => handleSave(u.id, u.stravaId)}
                          disabled={saving === u.id}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold text-white transition-all disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #7c4dff, #00e3fd)" }}>
                          {saving === u.id ? (
                            <span className="animate-pulse">Saving…</span>
                          ) : saved === u.id ? (
                            <><Check size={12} /> Saved</>
                          ) : (
                            <><Check size={12} /> Save changes</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ── SESSIONS TAB ────────────────────────────────────────────────── */}
        {activeTab === "sessions" && (
          <section className="space-y-2">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
              {championSessions.length} total · {sessionsThisMonth.length} this month
            </p>
            {championSessions.length === 0 ? (
              <div className="glass-card p-10 text-center">
                <p className="text-[#cac3d8] text-sm">No champion sessions yet.</p>
              </div>
            ) : (
              [...championSessions]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((s) => {
                  const owner = users.find((u) => u.id === s.userId);
                  const isThisMonth = s.date.startsWith(thisMonth);
                  return (
                    <div key={s.id} className="glass-card p-4 flex items-start gap-3">
                      {/* Type badge */}
                      <div className="flex-shrink-0 mt-0.5">
                        <span className="text-[9px] font-bold rounded-full px-2 py-1 uppercase"
                          style={s.type === "champing" ? {
                            background: "rgba(124,77,255,0.2)", color: "#cdbdff",
                          } : {
                            background: "rgba(0,227,253,0.15)", color: "#00e3fd",
                          }}>
                          {s.type === "champing" ? "Champing" : "FTP"}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-[#e5e2e1] truncate">
                            {owner?.name ?? "Unknown rider"}
                          </p>
                          {isThisMonth && (
                            <span className="text-[9px] rounded-full px-1.5 py-0.5 font-bold"
                              style={{ background: "rgba(0,227,253,0.12)", color: "#00e3fd" }}>
                              THIS MONTH
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#cac3d8] mt-0.5">
                          {format(new Date(s.date), "MMM d, yyyy")}
                          {s.zoneName ? ` · ${s.zoneName}` : ""}
                          {s.stravaActivityKm ? ` · ${s.stravaActivityKm} km` : ""}
                        </p>
                        {s.notes && (
                          <p className="text-[10px] text-[#cac3d8]/70 mt-1 leading-snug line-clamp-2">{s.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </section>
        )}

        {/* ── ZONES TAB ───────────────────────────────────────────────────── */}
        {activeTab === "zones" && (
          <section className="space-y-2">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#cac3d8]">
              {zones.length} zones
            </p>
            {zones.map((z) => {
              const creator = users.find((u) => u.id === z.createdBy);
              return (
                <div key={z.id} className="glass-card p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={13} style={{ color: "#cdbdff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#e5e2e1] truncate">{z.name}</p>
                      <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                        style={{ background: z.type === "training" ? "rgba(0,227,253,0.12)" : "rgba(124,77,255,0.15)",
                                 color: z.type === "training" ? "#00e3fd" : "#cdbdff" }}>
                        {z.type}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#cac3d8] mt-0.5">
                      {z.region} · {z.usageCount} sessions
                    </p>
                    <p className="text-[10px] text-[#cac3d8]/60 mt-0.5">
                      by {creator?.name ?? z.createdByName}
                    </p>
                    {z.description && (
                      <p className="text-[10px] text-[#cac3d8]/60 mt-1 leading-snug line-clamp-2">{z.description}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-[#cdbdff]">{z.usageCount}</p>
                    <p className="text-[9px] text-[#cac3d8]">sessions</p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* DB note */}
        <div className="glass rounded-2xl p-4 border border-[#00e3fd]/10">
          <p className="text-[10px] text-[#cac3d8] leading-relaxed">
            <span className="text-[#00e3fd] font-semibold">Note:</span> Role and tier changes are saved to Supabase.
            Changes take effect on next login. To set yourself as admin, run{" "}
            <code className="font-mono text-[#cdbdff]">UPDATE public.users SET role = &apos;admin&apos; WHERE strava_id = &apos;&lt;your_id&gt;&apos;;</code>{" "}
            in the Supabase SQL editor.
          </p>
        </div>

      </main>
      <NavBar />
    </div>
  );
}
