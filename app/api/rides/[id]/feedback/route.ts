import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { canChampionClub, getSignedInClubUser } from "@/lib/club-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminContext();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  try {
    const { id } = await params;
    const { data: ride, error: rideError } = await admin.db
      .from("team_rides")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });

    // Founder/admin receives the minimum operational projection. Rider IDs
    // stay out of the response and this endpoint is never used by public UI.
    const { data, error } = await admin.db
      .from("ride_feedback")
      .select("id,note,created_at")
      .eq("ride_id", id)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ feedback: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSignedInClubUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const db = supabaseAdmin();
    const { data: ride, error: rideError } = await db
      .from("team_rides")
      .select("id,team_id,starts_at")
      .eq("id", id)
      .maybeSingle();
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });
    if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    if (!canChampionClub(user, String(ride.team_id))) {
      return NextResponse.json({ error: "You are not a champion of this club." }, { status: 403 });
    }
    if (Date.now() < new Date(ride.starts_at).getTime()) {
      return NextResponse.json({ error: "Feedback opens after the ride." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note || note.length > 2000) {
      return NextResponse.json({ error: "Please enter a note up to 2,000 characters." }, { status: 400 });
    }

    // ride_feedback remains RLS-closed. Notes are only written/read through
    // service-role server routes and are never included in public ride payloads.
    const { error } = await db
      .from("ride_feedback")
      .upsert({ ride_id: id, champ_id: user.stravaId, note }, { onConflict: "ride_id,champ_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
