import { NextRequest, NextResponse } from "next/server";
import { getChampContext } from "@/lib/champ-auth";
import { serializeTeamRide, TeamRideRow } from "@/lib/team-rides";

export const runtime = "nodejs";

/**
 * Claim captaincy of a ride. First claim wins.
 *
 * The `.is("captain_id", null)` predicate is what makes it atomic: two riders
 * tapping at once both issue the same UPDATE, Postgres serialises them, and
 * the second matches zero rows. No read-then-write race, no lock needed.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChampContext();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;
  const { db, userId } = context;
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("team_rides")
    .update({ captain_id: userId, captain_claimed_at: now, updated_at: now })
    .eq("id", id)
    .is("captain_id", null)
    .eq("status", "scheduled")
    .gt("starts_at", now)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    // Zero rows updated. Read back to say which reason, without implying the
    // claim partially succeeded.
    const { data: current } = await db
      .from("team_rides")
      .select("captain_id,status,starts_at")
      .eq("id", id)
      .maybeSingle();

    if (!current) return NextResponse.json({ error: "Ride not found" }, { status: 404 });
    if (current.captain_id) {
      return NextResponse.json(
        { error: "This ride already has a captain", claimed: true },
        { status: 409 }
      );
    }
    if (current.status !== "scheduled") {
      return NextResponse.json({ error: "This ride is no longer scheduled" }, { status: 409 });
    }
    return NextResponse.json({ error: "This ride has already started" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    ride: serializeTeamRide(data as TeamRideRow, {
      captainName: context.name,
      viewerId: userId,
    }),
  });
}
