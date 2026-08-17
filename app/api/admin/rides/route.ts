import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { isRideCreationError, parseRideCreationInput } from "@/lib/club-rides";
import { supabaseAdmin } from "@/lib/supabase";

type AdminDb = ReturnType<typeof supabaseAdmin>;

export const runtime = "nodejs";

const RIDE_SELECT = "id,starts_at,meeting_point,route,capacity,captain_id,created_by,team_id,team:teams!team_rides_team_id_fkey(id,name,slug),captain:users!team_rides_captain_id_fkey(strava_id,name)";
const HISTORY_DAYS = 90;

async function countsByRide(db: AdminDb, table: "ride_checkins" | "ride_feedback", rideIds: string[]) {
  const counts = new Map<string, number>();
  if (rideIds.length === 0) return counts;
  const { data, error } = await db.from(table).select("ride_id").in("ride_id", rideIds);
  if (error) throw error;
  for (const row of (data ?? []) as { ride_id: string }[]) {
    counts.set(row.ride_id, (counts.get(row.ride_id) ?? 0) + 1);
  }
  return counts;
}

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: ridesData, error: ridesError }, { data: teams, error: teamsError }] = await Promise.all([
      ctx.db.from("team_rides").select(RIDE_SELECT).gte("starts_at", since).order("starts_at", { ascending: true }),
      ctx.db.from("teams").select("id,name,slug").order("name", { ascending: true }),
    ]);

    if (ridesError) return NextResponse.json({ error: ridesError.message }, { status: 500 });
    if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 });

    const rides = ridesData ?? [];
    const rideIds = rides.map((ride) => String(ride.id));
    const [checkins, feedback] = await Promise.all([
      countsByRide(ctx.db, "ride_checkins", rideIds),
      countsByRide(ctx.db, "ride_feedback", rideIds),
    ]);
    const now = Date.now();

    return NextResponse.json({
      teams: teams ?? [],
      rides: rides.map((ride) => ({
        ...ride,
        checkinCount: checkins.get(String(ride.id)) ?? 0,
        feedbackCount: feedback.get(String(ride.id)) ?? 0,
        isPast: new Date(ride.starts_at).getTime() < now,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load rides.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const rawBody = await req.json().catch(() => ({}));
  const body = rawBody && typeof rawBody === "object" ? { ...(rawBody as Record<string, unknown>) } : {};

  // PR #40's original /admin -> Rides tab predates club_id and meeting_point.
  // Keep that verified-good shell working for Team Vitality while /admin/rides
  // exposes the full club-aware form. This compatibility path can be removed
  // once the shell is rewritten, but it never creates an unscoped ride.
  if (!body.teamId) {
    const { data: vitality, error: vitalityError } = await ctx.db
      .from("teams")
      .select("id")
      .eq("slug", "team-vitality")
      .maybeSingle();
    if (vitalityError) return NextResponse.json({ error: vitalityError.message }, { status: 500 });
    if (!vitality) return NextResponse.json({ error: "Team Vitality club row is missing." }, { status: 500 });
    body.teamId = vitality.id;
  }
  if (!body.meetingPoint) body.meetingPoint = "See route description";

  const input = parseRideCreationInput(body);
  if (isRideCreationError(input)) return NextResponse.json({ error: input.error }, { status: 400 });

  const { data: team, error: teamError } = await ctx.db
    .from("teams")
    .select("id")
    .eq("id", input.teamId)
    .maybeSingle();
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });
  if (!team) return NextResponse.json({ error: "Club not found." }, { status: 404 });

  const { data, error } = await ctx.db
    .from("team_rides")
    .insert({
      team_id: input.teamId,
      starts_at: input.startsAt,
      meeting_point: input.meetingPoint,
      route: input.route,
      capacity: input.capacity,
      created_by: ctx.userId,
    })
    .select(RIDE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ride: { ...data, checkinCount: 0, feedbackCount: 0, isPast: false } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Founder/admin is the moderation escape hatch. Unlike a champ cancelling
  // their own empty ride, admin removal is permitted regardless of attendance.
  const { error } = await ctx.db.from("team_rides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
