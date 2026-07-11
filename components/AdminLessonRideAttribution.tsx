"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, CheckCircle2, ExternalLink, Loader2, Link2, Unlink } from "lucide-react";

type Rider = { id: string; name: string };
type Activity = {
  id: number;
  strava_id: string;
  name: string;
  distance: number | string;
  elevation_gain: number | string;
  moving_time: number;
  type: string;
  date: string;
  attribution: { id: string; notes: string | null; session_id: string | null } | null;
};

export default function AdminLessonRideAttribution({ riders }: { riders: Rider[] }) {
  const [userId, setUserId] = useState(riders[0]?.id ?? "");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (riderId: string) => {
    if (!riderId) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/lessons/activities?userId=${encodeURIComponent(riderId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as { activities?: Activity[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load Strava rides");
      setActivities(data.activities ?? []);
      setSelected([]);
    } catch (error) {
      setActivities([]);
      setNotice(error instanceof Error ? error.message : "Unable to load Strava rides");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(userId), 0);
    return () => window.clearTimeout(timer);
  }, [load, userId]);

  function toggle(activityId: number) {
    setSelected((current) => current.includes(activityId)
      ? current.filter((id) => id !== activityId)
      : [...current, activityId]);
  }

  async function markSelected() {
    if (!selected.length || !userId) return;
    setWorking(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/lessons/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, activityIds: selected, notes: "Coached cycling lesson" }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to mark lesson rides");
      await load(userId);
      setNotice(`${selected.length} ride${selected.length === 1 ? "" : "s"} attributed to coaching lessons.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to mark lesson rides");
    } finally {
      setWorking(false);
    }
  }

  async function unmark(activityId: number) {
    setWorking(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/lessons/activities?activityId=${activityId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to remove lesson attribution");
      await load(userId);
      setNotice("Lesson attribution removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to remove lesson attribution");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="glass-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link2 size={15} className="text-accent-foreground" />
        <div>
          <p className="text-sm font-black text-foreground">Strava lesson rides</p>
          <p className="text-[10px] text-muted-foreground">Select only rides that were coached lessons with you.</p>
        </div>
      </div>

      <label className="block">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Student</span>
        <select value={userId} onChange={(event) => setUserId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-xs font-bold text-foreground">
          {riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}
        </select>
      </label>

      {notice && <p className="mt-3 rounded-xl bg-foreground/[0.04] px-3 py-2 text-[10px] text-muted-foreground">{notice}</p>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading synced rides...</div>
      ) : !userId ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No riders available.</p>
      ) : activities.length === 0 ? (
        <p className="mt-3 rounded-xl border border-foreground/10 px-3 py-6 text-center text-xs text-muted-foreground">
          No synced cycling rides for this student yet. Ask her to connect Strava and sync first.
        </p>
      ) : (
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
          {activities.map((activity) => {
            const linked = Boolean(activity.attribution);
            return (
              <div key={activity.id} className={`flex items-center gap-3 rounded-xl border p-3 ${linked ? "border-emerald-500/25 bg-emerald-500/5" : "border-foreground/10"}`}>
                {linked ? (
                  <CheckCircle2 size={15} className="flex-shrink-0 text-emerald-500" />
                ) : (
                  <input type="checkbox" checked={selected.includes(activity.id)} onChange={() => toggle(activity.id)}
                    className="h-4 w-4 flex-shrink-0 accent-[#ff4b35]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-foreground">{activity.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(activity.date).toLocaleDateString("en-ZA", { dateStyle: "medium" })} · {(Number(activity.distance) / 1000).toFixed(1)} km · {activity.type}
                  </p>
                </div>
                <a href={`https://www.strava.com/activities/${encodeURIComponent(activity.strava_id)}`} target="_blank" rel="noopener noreferrer"
                  aria-label="View activity on Strava" className="text-muted-foreground"><ExternalLink size={13} /></a>
                {linked && (
                  <button type="button" disabled={working} onClick={() => unmark(activity.id)} aria-label="Remove lesson attribution"
                    className="text-red-500 disabled:opacity-50"><Unlink size={13} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={markSelected} disabled={!selected.length || working}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b35] px-4 py-3 text-xs font-black text-white disabled:opacity-40">
        {working ? <Loader2 size={14} className="animate-spin" /> : <Bike size={14} />} Mark selected as lesson rides
      </button>
    </div>
  );
}
