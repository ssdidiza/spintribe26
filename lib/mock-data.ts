import { User, Activity, ChampionSession, LeaderboardEntry, Zone } from "./types";

export const MOCK_CURRENT_USER: User = {
  id: "u1",
  stravaId: "12345678",
  name: "Alex Rider",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=AlexRider",
  role: "champion",
  tier: 400,
  isConnected: true,
};

export const MOCK_USERS: User[] = [
  MOCK_CURRENT_USER,
  {
    id: "u2",
    stravaId: "23456789",
    name: "Sam Wheels",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=SamWheels",
    role: "member",
    tier: 400,
    isConnected: true,
  },
  {
    id: "u3",
    stravaId: "34567890",
    name: "Jordan Miles",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=JordanMiles",
    role: "member",
    tier: 400,
    isConnected: true,
  },
  {
    id: "u4",
    stravaId: "45678901",
    name: "Taylor Swift",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=TaylorSwift",
    role: "member",
    tier: 400,
    isConnected: true,
  },
  {
    id: "u5",
    stravaId: "56789012",
    name: "Morgan Climb",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MorganClimb",
    role: "member",
    tier: 200,
    isConnected: true,
  },
  {
    id: "u6",
    stravaId: "67890123",
    name: "Casey Sprint",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=CaseySprint",
    role: "member",
    tier: 600,
    isConnected: true,
  },
  {
    id: "u7",
    stravaId: "78901234",
    name: "Riley Watts",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=RileyWatts",
    role: "champion",
    tier: 800,
    isConnected: true,
  },
  {
    id: "u8",
    stravaId: "89012345",
    name: "Drew Breakaway",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=DrewBreakaway",
    role: "member",
    tier: 1000,
    isConnected: true,
  },
];

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: "a1",
    userId: "u1",
    stravaId: "s1",
    name: "Morning Zone 2 Ride",
    distance: 45200,
    movingTime: 5400,
    type: "Ride",
    date: "2026-05-05T07:30:00Z",
    kudos: 12,
  },
  {
    id: "a2",
    userId: "u1",
    stravaId: "s2",
    name: "FTP Interval Session",
    distance: 32100,
    movingTime: 3600,
    type: "VirtualRide",
    date: "2026-05-03T06:00:00Z",
    kudos: 8,
  },
  {
    id: "a3",
    userId: "u1",
    stravaId: "s3",
    name: "Weekend Group Ride",
    distance: 89400,
    movingTime: 10800,
    type: "Ride",
    date: "2026-05-01T08:00:00Z",
    kudos: 24,
  },
  {
    id: "a4",
    userId: "u1",
    stravaId: "s4",
    name: "Recovery Spin",
    distance: 22700,
    movingTime: 2700,
    type: "VirtualRide",
    date: "2026-04-29T17:00:00Z",
    kudos: 5,
  },
  {
    id: "a5",
    userId: "u1",
    stravaId: "s5",
    name: "Champing Session – Zones",
    distance: 55000,
    movingTime: 7200,
    type: "Ride",
    date: "2026-04-26T07:00:00Z",
    kudos: 18,
  },
];

export const MOCK_CHAMPION_SESSIONS: ChampionSession[] = [
  {
    id: "cs1",
    userId: "u1",
    type: "ftp_improver",
    date: "2026-05-03T06:00:00Z",
    notes: "Zwift FTP ramp test + 2x20 threshold blocks",
  },
  {
    id: "cs2",
    userId: "u1",
    type: "champing",
    date: "2026-05-01T08:00:00Z",
    notes: "Weekend champing — Zone 3/4 on the N14",
  },
  {
    id: "cs3",
    userId: "u1",
    type: "champing",
    date: "2026-04-26T07:00:00Z",
    notes: "Pre-dawn champing session with group",
  },
  {
    id: "cs4",
    userId: "u1",
    type: "ftp_improver",
    date: "2026-04-20T06:30:00Z",
    notes: "VO2max intervals x5",
  },
];

export function getMonthlyKm(userId: string, activities: Activity[]): number {
  const now = new Date();
  const monthActivities = activities.filter((a) => {
    const d = new Date(a.date);
    return (
      a.userId === userId &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });
  const totalMetres = monthActivities.reduce((s, a) => s + a.distance, 0);
  return Math.round(totalMetres / 1000);
}

export function getChampingSessionsThisMonth(
  userId: string,
  sessions: ChampionSession[]
): number {
  const now = new Date();
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return (
      s.userId === userId &&
      s.type === "champing" &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  }).length;
}

export function getChampingSessionsThisYear(
  userId: string,
  sessions: ChampionSession[]
): number {
  const now = new Date();
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return (
      s.userId === userId &&
      s.type === "champing" &&
      d.getFullYear() === now.getFullYear()
    );
  }).length;
}

/**
 * Returns the zone where the most activities took place this month.
 * Falls back to the zone with the highest usageCount if no GPS data is available.
 */
export function getFeaturedZone(
  activities: Activity[],
  zones: Zone[],
  userId?: string
): Zone | null {
  if (!zones.length) return null;

  // Count activities per detected zone (all users' activities for community feel,
  // or filter by userId if provided)
  const counts: Record<string, number> = {};
  const now = new Date();
  for (const a of activities) {
    if (userId && a.userId !== userId) continue;
    const d = new Date(a.date);
    const isThisMonth =
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (isThisMonth && a.detectedZoneId) {
      counts[a.detectedZoneId] = (counts[a.detectedZoneId] ?? 0) + 1;
    }
  }

  // If we have GPS-detected zone data, pick the most active
  if (Object.keys(counts).length > 0) {
    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const match = zones.find((z) => z.id === topId);
    if (match) return match;
  }

  // Fallback: highest usageCount geographic zone
  return (
    zones
      .filter((z) => z.type === "geographic")
      .sort((a, b) => b.usageCount - a.usageCount)[0] ?? zones[0]
  );
}

export function buildLeaderboard(
  tier: number,
  users: User[],
  activities: Activity[]
): LeaderboardEntry[] {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Single O(n) pass over all activities to aggregate monthly km per user.
  // Avoids the previous O(m×n) pattern where getMonthlyKm scanned all
  // activities once per user.
  const kmByUser: Record<string, number> = {};
  for (const a of activities) {
    const d = new Date(a.date);
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      kmByUser[a.userId] = (kmByUser[a.userId] ?? 0) + a.distance;
    }
  }

  return users
    .filter((u) => u.tier === tier)
    .map((u) => {
      const totalKm = Math.round((kmByUser[u.id] ?? 0) / 1000);
      return {
        user: u,
        totalKm,
        targetKm: u.tier,
        progressPct: Math.min(100, Math.round((totalKm / u.tier) * 100)),
        rank: 0,
      };
    })
    .sort((a, b) => b.totalKm - a.totalKm)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
