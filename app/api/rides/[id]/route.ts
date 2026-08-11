import { NextRequest, NextResponse } from "next/server";
import { getChampContext } from "@/lib/champ-auth";
import { serializeTeamRide, TeamRideRow } from "@/lib/team-rides";

export const runtime = "nodejs";

/**
 * Ride detail for the captain's view: who has checked in.
 *
 * Champ-gated. The attendee NAME list goes only to the ride's captain and to
 * admins — every other champ gets the turnout count, same as the public list.
 * A club roster is not something one member should be able to enumerate about
 * another, and the privacy policy commits to check-in data being for club
 * operations rather than display.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChampContext();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;
  const { db, userId, isAdmin } = context;

  const { data: rideRow, error: rideError } = await db
    .from("team_rides")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
  if (!rideRow) return NextResponse.json({ error: "Ride not found" }, { status: 404 });

  const ride = rideRow as TeamRideRow;

  const { data: checkins, error: checkinError } = await db
    .from("ride_checkins")
    .select("user_strava_id,checked_in_at")
    .eq("ride_id", id)
    .order("checked_in_at", { ascending: true });
  if (checkinError) return NextResponse.json({ error: checkinError.message }, { status: 500 });

  const rows = checkins ?? [];
  const canSeeNames = isAdmin || ride.captain_id === userId;

  let attendees: Array<{ name: string; checkedInAt: string }> = [];
  if (canSeeNames && rows.length) {
    const { data: people } = await db
      .from("users")
      .select("strava_id,name")
      .in("strava_id", rows.map((row) => row.user_strava_id));
    const nameById = new Map((people ?? []).map((p) => [p.strava_id, p.name as string]));
    attendees = rows.map((row) => ({
      name: nameById.get(row.user_strava_id) ?? "Rider",
      checkedInAt: row.checked_in_at,
    }));
  }

  const captainName = ride.captain_id
    ? (
        await db.from("users").select("name").eq("strava_id", ride.captain_id).maybeSingle()
      ).data?.name ?? null
    : null;

  return NextResponse.json({
    ride: serializeTeamRide(ride, {
      captainName,
      checkinCount: rows.length,
      viewerId: userId,
      viewerCheckedIn: rows.some((row) => row.user_strava_id === userId),
    }),
    attendees,
    canSeeNames,
  });
}
