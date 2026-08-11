import { NextRequest, NextResponse } from "next/server";
import { getChampContext } from "@/lib/champ-auth";
import { isCheckInOpen } from "@/lib/team-rides";

export const runtime = "nodejs";

/**
 * Check in to a ride. Live only on the day of the ride (SAST).
 *
 * Idempotent: the (ride_id, user_strava_id) unique index means a double-tap or
 * a retry lands on the same row rather than inflating the turnout count.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChampContext();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;
  const { db, userId } = context;

  const { data: ride, error: rideError } = await db
    .from("team_rides")
    .select("id,starts_at,status,capacity")
    .eq("id", id)
    .maybeSingle();

  if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
  if (!ride) return NextResponse.json({ error: "Ride not found" }, { status: 404 });
  if (ride.status !== "scheduled") {
    return NextResponse.json({ error: "This ride is no longer scheduled" }, { status: 409 });
  }
  if (!isCheckInOpen(ride.starts_at)) {
    return NextResponse.json(
      { error: "Check-in opens on the morning of the ride" },
      { status: 409 }
    );
  }

  // Advisory capacity check. Not a hard guarantee under concurrency — see
  // open item (a) in team-vitality-rides-migration.sql. Capacity is null
  // (uncapped) for every ride until that is decided.
  if (ride.capacity !== null) {
    const { count, error: countError } = await db
      .from("ride_checkins")
      .select("id", { count: "exact", head: true })
      .eq("ride_id", id);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

    const { data: existing } = await db
      .from("ride_checkins")
      .select("id")
      .eq("ride_id", id)
      .eq("user_strava_id", userId)
      .maybeSingle();

    if (!existing && (count ?? 0) >= ride.capacity) {
      return NextResponse.json({ error: "This ride is full" }, { status: 409 });
    }
  }

  const { error: insertError } = await db
    .from("ride_checkins")
    .upsert(
      { ride_id: id, user_strava_id: userId, checked_in_at: new Date().toISOString() },
      { onConflict: "ride_id,user_strava_id", ignoreDuplicates: true }
    );

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { count } = await db
    .from("ride_checkins")
    .select("id", { count: "exact", head: true })
    .eq("ride_id", id);

  return NextResponse.json({ ok: true, checkedIn: true, checkinCount: count ?? 0 });
}
