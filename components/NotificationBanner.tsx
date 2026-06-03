"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { AppNotification } from "@/lib/types";
import { Bell, X, CheckCircle2 } from "lucide-react";

const RELEASE_NOTIFICATIONS: Omit<AppNotification, "userId">[] = [
  {
    id: "release-annual-champ-rides",
    type: "info",
    title: "New: year ride check-ins",
    body: "Champions can now import year-to-date rides and log earlier zone champing sessions from the Champion tab.",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "release-beta-feedback",
    type: "info",
    title: "Beta feedback is open",
    body: "Use the Profile feedback board to send suggestions, vote on member ideas, and see admin replies.",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
];

function mapNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    userId: row.user_strava_id as string,
    type: row.type as AppNotification["type"],
    title: row.title as string,
    body: row.body as string,
    dismissedAt: row.dismissed_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    createdAt: row.created_at as string,
  };
}

export default function NotificationBanner() {
  const { currentUser } = useStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissedReleaseIds, setDismissedReleaseIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("spera-dismissed-release-notifications");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [acting, setActing] = useState(false);

  const userId = currentUser?.id;

  useEffect(() => {
    if (!userId) return;

    // Fetch existing notifications
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then(({ notifications: data }) => {
        setNotifications(data ?? []);
      })
      .catch((e) => console.warn("Notifications fetch failed:", e));

    // Subscribe to realtime inserts
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_strava_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [mapNotification(payload.new as Record<string, unknown>), ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const releaseNotifications = RELEASE_NOTIFICATIONS
    .filter((n) => !dismissedReleaseIds.has(n.id))
    .map((n) => ({ ...n, userId: userId ?? "release" }));
  const active = notifications.find((n) => !n.dismissedAt && !n.completedAt) ?? releaseNotifications[0];
  const isReleaseNotification = active?.id.startsWith("release-") ?? false;

  if (!active) return null;

  async function handleAction(action: "dismiss" | "complete") {
    if (!active) return;
    setActing(true);
    try {
      if (active.id.startsWith("release-")) {
        const next = new Set(dismissedReleaseIds).add(active.id);
        setDismissedReleaseIds(next);
        localStorage.setItem("spera-dismissed-release-notifications", JSON.stringify([...next]));
        setActing(false);
        return;
      }

      await fetch(`/api/notifications/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === active.id
            ? {
                ...n,
                ...(action === "dismiss"
                  ? { dismissedAt: new Date().toISOString() }
                  : { completedAt: new Date().toISOString() }),
              }
            : n
        )
      );
    } catch (e) {
      console.warn("Notification action failed:", e);
    }
    setActing(false);
  }

  return (
    <div
      className="relative rounded-2xl p-4 mb-5"
      style={{
        background: "rgba(255,75,53,0.08)",
        border: "1px solid transparent",
        backgroundClip: "padding-box",
        boxShadow: "inset 0 0 0 1px rgba(255,75,53,0.3), inset 0 0 0 1px rgba(255,255,255,0.15)",
      }}
    >
      {/* Gradient border effect */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(255,75,53,0.3), rgba(255,255,255,0.15)) border-box",
          WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
          border: "1px solid transparent",
        }}
      />

      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "linear-gradient(135deg, #ff4b35, #ffffff)" }}
        >
          <Bell size={14} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-[#ffffff] mb-1">{active.title}</p>
          <p className="text-xs text-[#b8b8b8] leading-relaxed">{active.body}</p>

          <div className="flex gap-2 mt-3">
            {!isReleaseNotification && (
              <button
                onClick={() => handleAction("complete")}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                <CheckCircle2 size={12} />
                Mark complete
              </button>
            )}
            <button
              onClick={() => handleAction("dismiss")}
              disabled={acting}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.05)", color: "#b8b8b8", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <X size={12} />
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
