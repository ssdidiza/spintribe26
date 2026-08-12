import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

type AdminDb = ReturnType<typeof supabaseAdmin>;

export const runtime = "nodejs";

const RIDE_SELECT = "id,starts_at,route,capacity,captain_id,captain:users!team_rides_captain_id_fkey(strava_id,name)";

/** Rides this far back still show in the console so recent turnout stays visible. */
const HISTORY_DAYS = 90;

function readRideInput(body: Record<string, unknown>) {
  const route = String(body.route ?? "").trim().slice(0, 500);
  const startsAtRaw = String(body.startsAt ?? "").trim();
  const capacity = Math.round(Number(body.capacity ?? 20));

  if (route.length < 2) return { error: "Describe the route." as const };
  if (!startsAtRaw) return { error: "Pick a date and time." as const };

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) return { error: "That date and time could not be read." as const };
  if (startsAt.getTime() <= Date.now()) return { error: "Schedule the ride in the future." as const };
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 200) {
    return { error: "Capacity must be between 1 and 200." as const };
  }

  return { route, startsAt: startsAt.toISOString(), capacity };
}

/**
 * Counts participation per ride in one round trip each. Only counts cross the
 * wire -- private feedback notes stay service-role-only and are never returned.
 */
async function countsByRide(db: AdminDb, table: "ride_checkins" | "ride_feedback", rideIds: string[]) {
  const counts = new Map<string, number>();
  if (rideIds.length === 0) return counts;
  const { data } = await db.from(table).select("ride_id").in("ride_id", rideIds);
  for (const row of (data ?? []) as { ride_id: string }[]) {
    counts.set(row.ride_id, (counts.get(row.ride_id) ?? 0) + 1);
  }
  return counts;
}

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await ctx.db
    .from("team_rides")
    .select(RIDE_SELECT)
    .gte("starts_at", since)
    .order("starts_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rides = data ?? [];
  const rideIds = rides.map((ride) => ride.id);
  const [checkins, feedback] = await Promise.all([
    countsByRide(ctx.db, "ride_checkins", rideIds),
    countsByRide(ctx.db, "ride_feedback", rideIds),
  ]);

  // isPast is decided here so the client never has to read its own clock to
  // classify a ride, which would disagree with prerendered output.
  const now = Date.now();
  return NextResponse.json({
    rides: rides.map((ride) => ({
      ...ride,
      checkinCount: checkins.get(ride.id) ?? 0,
      feedbackCount: feedback.get(ride.id) ?? 0,
      isPast: new Date(ride.starts_at).getTime() < now,
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const input = readRideInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const { data, error } = await ctx.db
    .from("team_rides")
    .insert({ starts_at: input.startsAt, route: input.route, capacity: input.capacity })
    .select(RIDE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ride: { ...data, checkinCount: 0, feedbackCount: 0, isPast: false } });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // ride_checkins cascades on delete, so a ride champs already attended would
  // take its turnout record with it. Cancel those by hand if you really mean to.
  const { count, error: countError } = await ctx.db
    .from("ride_checkins")
    .select("id", { count: "exact", head: true })
    .eq("ride_id", id);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Champs have already checked into this ride, so it cannot be removed." },
      { status: 409 }
    );
  }

  const { error } = await ctx.db.from("team_rides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
