import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const db = supabaseAdmin();
    const displayName =
      data.user.user_metadata?.full_name ||
      data.user.user_metadata?.name ||
      data.user.email?.split("@")[0] ||
      "Rider";

    const { error: profileError } = await db.from("users").upsert(
      {
        strava_id: data.user.id,
        name: displayName,
        leaderboard_consent: false,
        rewards_export_consent: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "strava_id", ignoreDuplicates: true },
    );
    if (profileError) throw profileError;

    const { data: linkedAthlete, error: linkError } = await db
      .from("users")
      .select("strava_id")
      .eq("auth_user_id", data.user.id)
      .not("strava_access_token", "is", null)
      .maybeSingle();
    if (linkError) throw linkError;

    const session = await getSession();
    session.userId = data.user.id;
    session.athleteId = linkedAthlete?.strava_id
      ? Number(linkedAthlete.strava_id)
      : undefined;
    await session.save();

    return NextResponse.json({ ok: true, athleteId: linkedAthlete?.strava_id ?? null });
  } catch (err) {
    console.error("email-session error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
