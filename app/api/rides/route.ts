import { NextResponse } from "next/server";
import { getViewerContext } from "@/lib/champ-auth";
import { serializeTeamRide, TeamRideRow } from "@/lib/team-rides";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Public: upcoming Team Vitality rides. No auth required to look — the club is
 * the free front door, and a visitor should see what they'd be joining before
 * being asked to sign up. Acting on a ride (captain / check in / feedback)
 * requires champ membership and is enforced on those routes.
 */

// Keep today's ride visible after it has started so the check-in button is
// still reachable mid-morning.
const LOOKBACK_MS = 18 * 60 * 60 * 1000;
const MAX_RIDES = 20;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const viewer = await getViewerContext();
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

    const { data: rideRows, error: ridesError } = await db
      .from("team_rides")
      .select("*")
      .eq("status", "scheduled")
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .limit(MAX_RIDES);
    if (ridesError) throw ridesError;

    const rides = (rideRows ?? []) as TeamRideRow[];
    if (!rides.length) {
      return NextResponse.json({ rides: [], viewer });
    }

    const rideIds = rides.map((ride) => ride.id);
    const captainIds = [...new Set(rides.map((r) => r.captain_id).filter(Boolean))] as string[];

    const [checkinResult, captainResult, feedbackResult] = await Promise.all([
      db.from("ride_checkins").select("ride_id,user_strava_id").in("ride_id", rideIds),
      captainIds.length
        ? db.from("users").select("strava_id,name").in("strava_id", captainIds)
        : Promise.resolve({ data: [], error: null }),
      // Only ever the viewer's own row: feedback is private to admins, so the
      // list must not leak who else submitted one.
      viewer.userId
        ? db
            .from("ride_feedback")
            .select("ride_id")
            .in("ride_id", rideIds)
            .eq("user_strava_id", viewer.userId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (checkinResult.error) throw checkinResult.error;
    if (captainResult.error) throw captainResult.error;
    if (feedbackResult.error) throw feedbackResult.error;

    const countByRide = new Map<string, number>();
    const viewerCheckedIn = new Set<string>();
    for (const row of checkinResult.data ?? []) {
      countByRide.set(row.ride_id, (countByRide.get(row.ride_id) ?? 0) + 1);
      if (viewer.userId && row.user_strava_id === viewer.userId) viewerCheckedIn.add(row.ride_id);
    }

    const captainNames = new Map(
      (captainResult.data ?? []).map((row) => [row.strava_id, row.name as string])
    );
    const viewerFeedback = new Set((feedbackResult.data ?? []).map((row) => row.ride_id));
    const now = new Date();

    return NextResponse.json({
      rides: rides.map((ride) =>
        serializeTeamRide(ride, {
          captainName: ride.captain_id ? captainNames.get(ride.captain_id) ?? null : null,
          checkinCount: countByRide.get(ride.id) ?? 0,
          viewerId: viewer.userId,
          viewerCheckedIn: viewerCheckedIn.has(ride.id),
          viewerLeftFeedback: viewerFeedback.has(ride.id),
          now,
        })
      ),
      viewer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load rides";
    return NextResponse.json({ error: message, rides: [] }, { status: 500 });
  }
}
