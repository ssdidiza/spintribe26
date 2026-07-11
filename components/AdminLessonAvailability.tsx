"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Check, Clock3, Loader2, Plus, Trash2 } from "lucide-react";

type RuleRow = {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

type BlackoutRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_RULES: RuleRow[] = DAY_NAMES.map((_, weekday) => ({
  weekday,
  start_time: weekday === 6 ? "06:00" : "06:00",
  end_time: weekday === 6 ? "13:00" : "18:00",
  active: weekday > 0 && weekday < 7,
}));

export default function AdminLessonAvailability() {
  const [rules, setRules] = useState<RuleRow[]>(DEFAULT_RULES);
  const [blackouts, setBlackouts] = useState<BlackoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");
  const [blackout, setBlackout] = useState({ startsAt: "", endsAt: "", reason: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/lessons/availability", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as {
        rules?: RuleRow[];
        blackouts?: BlackoutRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load availability");
      const incoming = new Map((data.rules ?? []).map((rule) => [rule.weekday, rule]));
      setRules(DEFAULT_RULES.map((fallback) => incoming.get(fallback.weekday) ?? fallback));
      setBlackouts(data.blackouts ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load availability");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function updateRule(weekday: number, patch: Partial<RuleRow>) {
    setRules((current) => current.map((rule) => rule.weekday === weekday ? { ...rule, ...patch } : rule));
  }

  async function saveRule(rule: RuleRow) {
    setSaving(`rule-${rule.weekday}`);
    setNotice("");
    try {
      const response = await fetch("/api/admin/lessons/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: rule.weekday,
          startTime: rule.start_time.slice(0, 5),
          endTime: rule.end_time.slice(0, 5),
          active: rule.active,
        }),
      });
      const data = await response.json().catch(() => ({})) as { rule?: RuleRow; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save availability");
      if (data.rule) updateRule(rule.weekday, data.rule);
      setNotice(`${DAY_NAMES[rule.weekday]} availability saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save availability");
    } finally {
      setSaving("");
    }
  }

  async function addBlackout() {
    if (!blackout.startsAt || !blackout.endsAt) return;
    setSaving("blackout-new");
    setNotice("");
    try {
      const response = await fetch("/api/admin/lessons/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: new Date(blackout.startsAt).toISOString(),
          endsAt: new Date(blackout.endsAt).toISOString(),
          reason: blackout.reason,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to add blackout");
      setBlackout({ startsAt: "", endsAt: "", reason: "" });
      await load();
      setNotice("Unavailable time added.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to add blackout");
    } finally {
      setSaving("");
    }
  }

  async function removeBlackout(id: string) {
    setSaving(`blackout-${id}`);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/lessons/availability?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to remove blackout");
      setBlackouts((current) => current.filter((row) => row.id !== id));
      setNotice("Unavailable time removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to remove blackout");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="glass-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <Clock3 size={15} className="text-accent-foreground" />
        <div>
          <p className="text-sm font-black text-foreground">Booking availability</p>
          <p className="text-[10px] text-muted-foreground">Set normal coaching hours and block time away.</p>
        </div>
      </div>

      {notice && <p className="mb-3 rounded-xl bg-foreground/[0.04] px-3 py-2 text-[10px] text-muted-foreground">{notice}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading schedule...</div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.weekday} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-xl border border-foreground/10 p-2.5">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={rule.active} onChange={(event) => updateRule(rule.weekday, { active: event.target.checked })}
                  className="h-4 w-4 accent-[#ff4b35]" />
                <span className="text-xs font-bold text-foreground">{DAY_NAMES[rule.weekday]}</span>
              </label>
              <input type="time" value={rule.start_time.slice(0, 5)} disabled={!rule.active}
                onChange={(event) => updateRule(rule.weekday, { start_time: event.target.value })}
                className="w-24 rounded-lg border border-foreground/10 bg-card px-2 py-1.5 text-[10px] text-foreground disabled:opacity-40" />
              <input type="time" value={rule.end_time.slice(0, 5)} disabled={!rule.active}
                onChange={(event) => updateRule(rule.weekday, { end_time: event.target.value })}
                className="w-24 rounded-lg border border-foreground/10 bg-card px-2 py-1.5 text-[10px] text-foreground disabled:opacity-40" />
              <button type="button" aria-label={`Save ${DAY_NAMES[rule.weekday]}`} onClick={() => saveRule(rule)}
                disabled={saving === `rule-${rule.weekday}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ff4b35]/30 text-accent-foreground disabled:opacity-50">
                {saving === `rule-${rule.weekday}` ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-foreground/10 pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          <CalendarOff size={12} /> Block unavailable time
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <input type="datetime-local" value={blackout.startsAt} onChange={(event) => setBlackout((current) => ({ ...current, startsAt: event.target.value }))}
            className="rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs text-foreground" />
          <input type="datetime-local" value={blackout.endsAt} onChange={(event) => setBlackout((current) => ({ ...current, endsAt: event.target.value }))}
            className="rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs text-foreground" />
          <input value={blackout.reason} onChange={(event) => setBlackout((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Reason (optional)" className="rounded-lg border border-foreground/10 bg-card px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60" />
          <button type="button" onClick={addBlackout} disabled={!blackout.startsAt || !blackout.endsAt || saving === "blackout-new"}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#ff4b35] px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">
            {saving === "blackout-new" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add blackout
          </button>
        </div>
        {blackouts.length > 0 && (
          <div className="mt-3 space-y-2">
            {blackouts.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl bg-foreground/[0.035] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-foreground">
                    {new Date(row.starts_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                    {" – "}
                    {new Date(row.ends_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  {row.reason && <p className="truncate text-[9px] text-muted-foreground">{row.reason}</p>}
                </div>
                <button type="button" aria-label="Remove unavailable time" onClick={() => removeBlackout(row.id)}
                  disabled={saving === `blackout-${row.id}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
