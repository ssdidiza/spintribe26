"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  User,
  Activity,
  ChampionSession,
  Zone,
  Tier,
  UserRole,
  SEED_ZONES,
} from "./types";
import {
  MOCK_USERS,
  MOCK_ACTIVITIES,
  MOCK_CHAMPION_SESSIONS,
} from "./mock-data";

const safeStorage =
  typeof window !== "undefined"
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }));

interface AppState {
  currentUser: User | null;
  users: User[];
  activities: Activity[];
  championSessions: ChampionSession[];
  zones: Zone[];
  isOnboarded: boolean;

  login: (
    stravaId?: string,
    name?: string,
    avatar?: string,
    profile?: Pick<Partial<User>, "ftp" | "ftpCachedAt" | "country" | "role" | "tier" | "zone" | "region" | "onboarded" | "leaderboardConsent">
  ) => void;
  logout: () => void;
  completeOnboarding: (role: UserRole, tier: Tier, zone?: string, leaderboardConsent?: boolean) => void;
  addChampionSession: (
    type: "ftp_improver" | "champing",
    notes: string,
    opts?: {
      zoneId?: string;
      zoneName?: string;
      stravaActivityId?: string;
      stravaActivityName?: string;
      stravaActivityKm?: number;
    }
  ) => { success: boolean; reason?: string };
  deleteChampionSession: (sessionId: string) => void;
  hydrateChampionSessions: () => void;
  hydrateAthleteData: (forceRefresh?: boolean) => Promise<void>;
  hydrateActivities: () => Promise<void>;
  addZone: (zone: Omit<Zone, "id" | "usageCount" | "createdAt">) => Zone;
  incrementZoneUsage: (zoneId: string) => void;
  decrementZoneUsage: (zoneId: string) => void;
  syncStravaActivities: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: MOCK_USERS,
      activities: MOCK_ACTIVITIES,
      championSessions: MOCK_CHAMPION_SESSIONS,
      zones: SEED_ZONES,
      isOnboarded: false,

      login: (stravaId, name, avatar, profile) => {
        const id = stravaId ?? "mock-1";
        const newUser: User = {
          id,
          stravaId: stravaId ?? "12345678",
          name: name ?? "Alex Rider",
          avatar:
            avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name ?? "rider")}`,
          role: "member",
          tier: 400,
          isConnected: true,
          region: "Gauteng",
          onboarded: false,
          ...profile,
        };
        set((s) => ({
          currentUser: newUser,
          users: s.users.some((u) => u.id === id)
            ? s.users
            : [...s.users, newUser],
        }));
      },

      logout: () => {
        set({ currentUser: null, isOnboarded: false });
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      },

      completeOnboarding: (role, tier, zone, leaderboardConsent) => {
        const user = get().currentUser;
        if (!user) return;
        const updated = { ...user, role, tier, onboarded: true, leaderboardConsent: leaderboardConsent ?? false, ...(zone ? { zone, region: zone } : {}) };
        set({
          currentUser: updated,
          isOnboarded: true,
          users: get().users.map((u) => (u.id === user.id ? updated : u)),
        });
      },

      addChampionSession: (type, notes, opts = {}) => {
        const user = get().currentUser;
        if (!user) return { success: false, reason: "not_authenticated" };

        // Rule D: Prevent duplicate activity logging (client-side guard)
        if (opts.stravaActivityId) {
          const alreadyLogged = get().championSessions.some(
            (s) =>
              s.stravaActivityId === opts.stravaActivityId &&
              s.userId === user.id
          );
          if (alreadyLogged) {
            return { success: false, reason: "duplicate_activity" };
          }
        }

        const localId = `cs${Date.now()}`;
        const session: ChampionSession = {
          id: localId,
          userId: user.id,
          type,
          date: new Date().toISOString(),
          notes,
          zoneId: opts.zoneId,
          zoneName: opts.zoneName,
          stravaActivityId: opts.stravaActivityId,
          stravaActivityName: opts.stravaActivityName,
          stravaActivityKm: opts.stravaActivityKm,
        };
        set({ championSessions: [...get().championSessions, session] });
        if (opts.zoneId) {
          get().incrementZoneUsage(opts.zoneId);
        }

        // Persist to Supabase (non-blocking, optimistic UI)
        fetch("/api/champion-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, notes, ...opts }),
        })
          .then(async (res) => {
            if (res.ok) {
              const { session: saved } = await res.json();
              // Update local ID to match Supabase ID so deletes work cross-device
              set((s) => ({
                championSessions: s.championSessions.map((cs) =>
                  cs.id === localId ? { ...cs, id: String(saved.id) } : cs
                ),
              }));
            }
          })
          .catch((e) => console.warn("Session not persisted to DB:", e));

        return { success: true };
      },

      // Rule B: Champions can delete erroneous check-ins
      deleteChampionSession: (sessionId) => {
        const session = get().championSessions.find((s) => s.id === sessionId);
        if (!session) return;
        // Reverse zone usage count if this session had a zone
        if (session.zoneId) {
          get().decrementZoneUsage(session.zoneId);
        }
        set((s) => ({
          championSessions: s.championSessions.filter((s) => s.id !== sessionId),
        }));

        // Also delete from Supabase (non-blocking)
        fetch(`/api/champion-sessions/${sessionId}`, { method: "DELETE" }).catch(
          (e) => console.warn("Session delete not propagated to DB:", e)
        );
      },

      // Hydrate champion sessions from Supabase (call on mount after auth)
      hydrateChampionSessions: () => {
        const user = get().currentUser;
        if (!user) return;
        fetch("/api/champion-sessions")
          .then(async (res) => {
            if (!res.ok) return;
            const { sessions } = await res.json();
            if (!sessions?.length) return;
            const mapped: ChampionSession[] = sessions.map(
              (s: {
                id: number;
                type: string;
                date: string;
                notes: string;
                zone_id?: number;
                zone_name?: string;
                strava_activity_id?: string;
                strava_activity_name?: string;
                strava_activity_km?: number;
              }) => ({
                id: String(s.id),
                userId: user.id,
                type: s.type,
                date: s.date,
                notes: s.notes ?? "",
                zoneId: s.zone_id ? String(s.zone_id) : undefined,
                zoneName: s.zone_name || undefined,
                stravaActivityId: s.strava_activity_id || undefined,
                stravaActivityName: s.strava_activity_name || undefined,
                stravaActivityKm: s.strava_activity_km || undefined,
              })
            );
            // Replace this user's sessions with the authoritative Supabase data
            set((s) => ({
              championSessions: [
                ...s.championSessions.filter((cs) => cs.userId !== user.id),
                ...mapped,
              ],
            }));
          })
          .catch((e) => console.error("Champion session hydration failed:", e));
      },

      addZone: (zoneData) => {
        const newZone: Zone = {
          ...zoneData,
          id: `zone_${Date.now()}`,
          usageCount: 0,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ zones: [...s.zones, newZone] }));
        return newZone;
      },

      incrementZoneUsage: (zoneId) => {
        set((s) => ({
          zones: s.zones.map((z) =>
            z.id === zoneId ? { ...z, usageCount: z.usageCount + 1 } : z
          ),
        }));
      },

      decrementZoneUsage: (zoneId) => {
        set((s) => ({
          zones: s.zones.map((z) =>
            z.id === zoneId
              ? { ...z, usageCount: Math.max(0, z.usageCount - 1) }
              : z
          ),
        }));
      },

      // Fetch athlete FTP from Strava and update currentUser
      hydrateAthleteData: async (forceRefresh = false) => {
        try {
          const res = await fetch(`/api/strava/athlete${forceRefresh ? "?refresh=1" : ""}`);
          if (!res.ok) return;
          const { ftp, country, cachedAt, source } = await res.json();
          const user = get().currentUser;
          if (!user) return;
          const shouldClearFtp = forceRefresh || source === "strava";
          const updated = {
            ...user,
            ftp: ftp ?? (shouldClearFtp ? undefined : user.ftp),
            ftpCachedAt: cachedAt ?? (shouldClearFtp ? undefined : user.ftpCachedAt),
            country: country ?? user.country,
          };
          set((s) => ({
            currentUser: updated,
            users: s.users.map((u) => (u.id === user.id ? updated : u)),
          }));
        } catch (e) {
          console.warn("FTP hydration failed:", e);
        }
      },

      hydrateActivities: async () => {
        try {
          const res = await fetch("/api/activities");
          if (!res.ok) return;
          const { activities: rows } = await res.json();
          const user = get().currentUser;
          if (!user || !Array.isArray(rows)) return;
          const mapped = rows.map((a: {
            strava_id: string; name: string; distance: number;
            moving_time: number; type: string; date: string;
            kudos: number; start_lat?: number; start_lng?: number;
            detected_zone_id?: string;
          }) => ({
            id: String(a.strava_id),
            userId: user.id,
            stravaId: String(a.strava_id),
            name: a.name,
            distance: a.distance,
            movingTime: a.moving_time,
            type: a.type,
            date: a.date,
            kudos: a.kudos,
            startLat: a.start_lat,
            startLng: a.start_lng,
            detectedZoneId: a.detected_zone_id ?? undefined,
          }));
          set((s) => ({
            activities: [
              ...s.activities.filter((a) => a.userId !== user.id),
              ...mapped,
            ],
          }));
        } catch (e) {
          console.warn("Activity hydration failed:", e);
        }
      },

      syncStravaActivities: async () => {
        try {
          const now = new Date();
          const res = await fetch("/api/strava/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              year: now.getFullYear(),
              month: now.getMonth() + 1,
              force: true,
            }),
          });
          if (!res.ok) return;
          const { activities } = await res.json();
          const user = get().currentUser;
          if (!user || !Array.isArray(activities)) return;
          const mapped: Activity[] = activities.map(
            (a: {
              id: number;
              name: string;
              distance: number;
              moving_time: number;
              type: string;
              start_date: string;
              kudos_count: number;
              detected_zone_id?: string | null;
            }) => ({
              id: String(a.id),
              userId: user.id,
              stravaId: String(a.id),
              name: a.name,
              distance: a.distance,
              movingTime: a.moving_time,
              type: a.type,
              date: a.start_date,
              kudos: a.kudos_count,
              detectedZoneId: a.detected_zone_id ?? undefined,
            })
          );
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
          set((s) => ({
            activities: [
              ...s.activities.filter((a) => {
                if (a.userId !== user.id) return true;
                const activityTime = new Date(a.date).getTime();
                return activityTime < monthStart || activityTime >= monthEnd;
              }),
              ...mapped,
            ],
          }));
        } catch (e) {
          console.error("Strava sync failed:", e);
        }
      },
    }),
    {
      name: "spintribe-store-v2",
      storage: safeStorage,
      partialize: (state) => ({
        currentUser: state.currentUser,
        isOnboarded: state.isOnboarded,
        championSessions: state.championSessions,
        zones: state.zones,
        activities: state.activities,
        users: state.users,
      }),
    }
  )
);
