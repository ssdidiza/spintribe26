import { NextRequest, NextResponse } from "next/server";
import { configuredFounderIds, isFounderAuthEmail } from "@/lib/founder";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });

    const db = supabaseAdmin();
    const { data, error } = await db.auth.getUser(accessToken);
    if (error || !data.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const displayName =
      data.user.user_metadata?.full_name ||
      data.user.user_metadata?.name ||
      data.user.email?.split("@")[0] ||
      "Rider";

    // The founder's canonical profile is Strava-keyed. Email auth must bind to
    // that row directly; otherwise a first email sign-in creates/falls through
    // to the auth-UUID profile and /admin resolves a non-admin user.
    if (isFounderAuthEmail(data.user.email)) {
      const { data: founder, error: founderError } = await db
        .from("users")
        .select("strava_id,auth_user_id,role")
        .in("strava_id", configuredFounderIds())
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (founderError) throw founderError;
      if (!founder) return NextResponse.json({ error: "Founder profile is missing." }, { status: 500 });
      if (founder.auth_user_id && founder.auth_user_id !== data.user.id) {
        return NextResponse.json({ error: "Founder profile is linked to another auth account." }, { status: 409 });
      }
      if (!founder.auth_user_id) {
        const { error: linkFounderError } = await db
          .from("users")
          .update({ auth_user_id: data.user.id, updated_at: new Date().toISOString() })
          .eq("strava_id", founder.strava_id)
          .is("auth_user_id", null);
        if (linkFounderError) throw linkFounderError;
      }
    }

    const existingLookup = await db
      .from("users")
      .select("strava_id,role")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    if (existingLookup.error) throw existingLookup.error;
    let existingProfile = existingLookup.data;

    if (!existingProfile) {
      const { error: profileError } = await db.from("users").upsert(
        {
          strava_id: data.user.id,
          auth_user_id: data.user.id,
          name: displayName,
          role: "member",
          leaderboard_consent: false,
          rewards_export_consent: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "strava_id" },
      );
      if (profileError) throw profileError;

      const refetched = await db
        .from("users")
        .select("strava_id,role")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();
      if (refetched.error) throw refetched.error;
      existingProfile = refetched.data;
    }

    const { data: linkedAthlete, error: linkError } = await db
      .from("users")
      .select("strava_id")
      .eq("auth_user_id", data.user.id)
      .not("strava_access_token", "is", null)
      .maybeSingle();
    if (linkError) throw linkError;

    const profileId = linkedAthlete?.strava_id ?? existingProfile?.strava_id ?? data.user.id;
    const { count: championClubCount, error: membershipError } = await db
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_strava_id", profileId)
      .eq("role", "champion");
    if (membershipError) throw membershipError;

    const session = await getSession();
    session.userId = data.user.id;
    session.athleteId = linkedAthlete?.strava_id ? Number(linkedAthlete.strava_id) : undefined;
    await session.save();

    return NextResponse.json({
      ok: true,
      athleteId: linkedAthlete?.strava_id ?? null,
      profileId,
      platformRole: existingProfile?.role ?? "member",
      clubChampion: (championClubCount ?? 0) > 0,
    });
  } catch (err) {
    console.error("email-session error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
