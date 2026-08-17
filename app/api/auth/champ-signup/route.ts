import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, inviteCode } = await req.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedCode = typeof inviteCode === "string" ? inviteCode.trim() : "";
    const expectedCode = process.env.CHAMP_INVITE_CODE?.trim() ?? "";

    if (!expectedCode || !normalizedCode || normalizedCode.toUpperCase() !== expectedCode.toUpperCase()) {
      return NextResponse.json({ error: "Invalid invite code." }, { status: 403 });
    }
    if (!normalizedEmail || !normalizedName || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Name, email, and a password of at least 8 characters are required." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: vitality, error: vitalityError } = await db
      .from("teams")
      .select("id")
      .eq("slug", "team-vitality")
      .maybeSingle();
    if (vitalityError) return NextResponse.json({ error: vitalityError.message }, { status: 500 });
    if (!vitality) return NextResponse.json({ error: "Team Vitality club setup is missing." }, { status: 500 });

    const { data, error } = await db.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name: normalizedName } },
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data.user) return NextResponse.json({ error: "Account could not be created." }, { status: 500 });
    if (!data.user.identities?.length) {
      return NextResponse.json({ error: "An account with this email already exists. Please sign in instead." }, { status: 409 });
    }

    const { data: existingProfile, error: existingProfileError } = await db
      .from("users")
      .select("strava_id")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    if (existingProfileError) return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
    if (existingProfile) {
      const { data: existingMembership } = await db
        .from("team_memberships")
        .select("role")
        .eq("user_strava_id", existingProfile.strava_id)
        .eq("team_id", vitality.id)
        .eq("role", "champion")
        .maybeSingle();
      if (existingMembership) return NextResponse.json({ error: "This account is already a Team Vitality champ. Please sign in." }, { status: 409 });
      return NextResponse.json({ error: "This email is already linked to an existing SpinTribe account." }, { status: 409 });
    }

    // Platform role remains member. Club authority lives only in
    // team_memberships, so this account can later champion another club without
    // another schema or another global role.
    const { error: profileError } = await db.from("users").upsert(
      {
        strava_id: data.user.id,
        auth_user_id: data.user.id,
        name: normalizedName,
        role: "member",
        onboarded: true,
        leaderboard_consent: false,
        rewards_export_consent: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "strava_id" },
    );
    if (profileError) return NextResponse.json({ error: "Account created, but profile setup failed." }, { status: 500 });

    const { error: membershipError } = await db.from("team_memberships").upsert(
      {
        user_strava_id: data.user.id,
        team_id: vitality.id,
        role: "champion",
        is_primary: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_strava_id,team_id" },
    );
    if (membershipError) return NextResponse.json({ error: "Account created, but club champion setup failed." }, { status: 500 });

    return NextResponse.json({
      ok: true,
      userId: data.user.id,
      requiresEmailConfirmation: !data.session,
      session: data.session ? { accessToken: data.session.access_token, refreshToken: data.session.refresh_token } : null,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create champion account." }, { status: 500 });
  }
}
