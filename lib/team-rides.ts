/**
 * Team Vitality club rides — free community pillar.
 *
 * Deliberately imports nothing from lib/lessons, lib/lesson-*, lib/payfast,
 * or lib/coaching-packages. Club membership must never depend on a purchase
 * (see AGENTS.md "Two pillars"). Keep it that way.
 */

const SAST_TZ = "Africa/Johannesburg";

export type TeamRideRow = {
  id: string;
  team_id: string | null;
  title: string;
  route: string | null;
  meeting_point: string | null;
  starts_at: string;
  duration_minutes: number;
  capacity: number | null;
  captain_id: string | null;
  captain_claimed_at: string | null;
  status: "scheduled" | "cancelled" | "completed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamRide = {
  id: string;
  title: string;
  route: string;
  meetingPoint: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  capacity: number | null;
  captainId: string | null;
  captainName: string | null;
  status: TeamRideRow["status"];
  /** Attendance so far. Visible to everyone — it is a turnout count, not a ranking. */
  checkinCount: number;
  /** Viewer-specific, resolved server-side. Never trust the client for these. */
  viewerIsCaptain: boolean;
  viewerCheckedIn: boolean;
  viewerLeftFeedback: boolean;
  captainOpen: boolean;
  checkInOpen: boolean;
  feedbackOpen: boolean;
  full: boolean;
};

/** YYYY-MM-DD in SAST, so "today" means today in Johannesburg, not UTC. */
function sastDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatRideWhen(startsAt: string) {
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SAST_TZ,
  }).format(starts);
}

export function rideEndsAt(startsAt: string, durationMinutes: number) {
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return startsAt;
  return new Date(starts.getTime() + Math.max(0, durationMinutes) * 60_000).toISOString();
}

/**
 * Check-in is live on the day of the ride, in SAST. Not a rolling 24h window:
 * "the day of the ride" is what a rider is told, so it is what we enforce.
 */
export function isCheckInOpen(startsAt: string, now: Date = new Date()) {
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return false;
  return sastDateKey(starts) === sastDateKey(now);
}

/** Feedback opens once the ride has actually finished. */
export function isFeedbackOpen(
  startsAt: string,
  durationMinutes: number,
  now: Date = new Date()
) {
  const ends = new Date(rideEndsAt(startsAt, durationMinutes));
  if (Number.isNaN(ends.getTime())) return false;
  return now.getTime() >= ends.getTime();
}

/** Captaincy can be claimed until the ride starts, and only once (first claim wins). */
export function isCaptainOpen(
  startsAt: string,
  captainId: string | null,
  now: Date = new Date()
) {
  if (captainId) return false;
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return false;
  return now.getTime() < starts.getTime();
}

export function serializeTeamRide(
  row: TeamRideRow,
  context: {
    captainName?: string | null;
    checkinCount?: number;
    viewerId?: string | null;
    viewerCheckedIn?: boolean;
    viewerLeftFeedback?: boolean;
    now?: Date;
  } = {}
): TeamRide {
  const now = context.now ?? new Date();
  const durationMinutes = Number(row.duration_minutes ?? 90);
  const checkinCount = context.checkinCount ?? 0;
  const capacity = row.capacity ?? null;
  const live = row.status === "scheduled";

  return {
    id: row.id,
    title: row.title,
    route: row.route ?? "",
    meetingPoint: row.meeting_point ?? "",
    startsAt: row.starts_at,
    endsAt: rideEndsAt(row.starts_at, durationMinutes),
    durationMinutes,
    capacity,
    captainId: row.captain_id,
    captainName: context.captainName ?? null,
    status: row.status,
    checkinCount,
    viewerIsCaptain: Boolean(context.viewerId && row.captain_id === context.viewerId),
    viewerCheckedIn: Boolean(context.viewerCheckedIn),
    viewerLeftFeedback: Boolean(context.viewerLeftFeedback),
    captainOpen: live && isCaptainOpen(row.starts_at, row.captain_id, now),
    checkInOpen: live && isCheckInOpen(row.starts_at, now),
    feedbackOpen: live && isFeedbackOpen(row.starts_at, durationMinutes, now),
    full: capacity !== null && checkinCount >= capacity,
  };
}
