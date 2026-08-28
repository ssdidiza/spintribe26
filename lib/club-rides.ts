export const DEFAULT_RIDE_CAPACITY = 20;
export const MAX_RIDE_CAPACITY = 100;
export const MAX_CHAMP_RIDES_PER_7_DAYS = 5;
export const RIDE_CREATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const CHECKIN_WINDOW_MS = 12 * 60 * 60 * 1000;

export function isRideCheckInOpen(startsAt: string | number | Date, nowMs: number) {
  const startMs = startsAt instanceof Date ? startsAt.getTime() : new Date(startsAt).getTime();
  return Number.isFinite(startMs) && Number.isFinite(nowMs) && Math.abs(nowMs - startMs) <= CHECKIN_WINDOW_MS;
}

export type RideCreationInput = {
  teamId: string;
  startsAt: string;
  meetingPoint: string;
  route: string;
  capacity: number;
};

export function parseRideCreationInput(body: unknown): RideCreationInput | { error: string } {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const teamId = typeof value.teamId === "string" ? value.teamId.trim() : "";
  const meetingPoint = typeof value.meetingPoint === "string" ? value.meetingPoint.trim() : "";
  const route = typeof value.route === "string" ? value.route.trim() : "";
  const startsAtValue = typeof value.startsAt === "string" ? value.startsAt : "";
  const startsAt = new Date(startsAtValue);
  const suppliedCapacity = value.capacity === undefined || value.capacity === null || value.capacity === ""
    ? DEFAULT_RIDE_CAPACITY
    : Number(value.capacity);

  if (!teamId) return { error: "Choose a club." };
  if (!startsAtValue || Number.isNaN(startsAt.getTime())) return { error: "Choose a valid ride date and time." };
  if (startsAt.getTime() <= Date.now()) return { error: "Rides must be scheduled in the future." };
  if (meetingPoint.length < 2 || meetingPoint.length > 180) return { error: "Meeting point must be 2-180 characters." };
  if (route.length < 3 || route.length > 500) return { error: "Route and pace description must be 3-500 characters." };
  if (!Number.isInteger(suppliedCapacity) || suppliedCapacity < 1 || suppliedCapacity > MAX_RIDE_CAPACITY) {
    return { error: `Capacity must be between 1 and ${MAX_RIDE_CAPACITY}.` };
  }

  return {
    teamId,
    startsAt: startsAt.toISOString(),
    meetingPoint,
    route,
    capacity: suppliedCapacity,
  };
}

export function isRideCreationError(value: RideCreationInput | { error: string }): value is { error: string } {
  return "error" in value;
}
