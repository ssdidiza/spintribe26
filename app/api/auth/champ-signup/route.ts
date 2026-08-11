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
    const { data, error } = await db.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: normalizedName },
      },
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data.user) return NextResponse.json({ error: "Account could not be created." }, { status: 500 });

    const { error: profileError } = await db.from("users").upsert(
      {
        strava_id: data.user.id,
        auth_user_id: data.user.id,
        name: normalizedName,
        role: "champion",
        onboarded: true,
        leaderboard_consent: false,
        rewards_export_consent: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "strava_id" },
    );

    if (profileError) return NextResponse.json({ error: "Account created, but champion profile setup failed." }, { status: 500 });

    return NextResponse.json({
      ok: true,
      userId: data.user.id,
      requiresEmailConfirmation: !data.session,
      session: data.session
        ? { accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
        : null,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create champion account." }, { status: 500 });
  }
}
