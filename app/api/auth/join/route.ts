import { NextRequest, NextResponse } from "next/server";
import { isChampSignupConfigured, isValidChampInviteCode } from "@/lib/champ-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Free Team Vitality signup. Creates a Supabase Auth user and a users row
 * with role 'champion'.
 *
 * No PayFast, no lesson_* read or write, no purchase gate — joining the club
 * costs nothing and requires no Strava account (see AGENTS.md "Two pillars").
 *
 * The role is assigned HERE, on the server, after the invite code is checked
 * here. The client never sends a role, and /api/auth/validate-invite is only a
 * convenience pre-check for the form — passing it grants nothing on its own.
 */

const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(req: NextRequest) {
  if (!isChampSignupConfigured()) {
    return NextResponse.json(
      { error: "Signup is not open yet. Ask Spera for an invite code." },
      { status: 503 }
    );
  }

  let body: { name?: unknown; email?: unknown; password?: unknown; inviteCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }
  // Checked server-side. The client pre-check is UX only.
  if (!isValidChampInviteCode(body.inviteCode)) {
    return NextResponse.json({ error: "That invite code isn't valid" }, { status: 403 });
  }

  const db = supabaseAdmin();

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // invite-gated, so no separate confirmation round-trip
    user_metadata: { full_name: name },
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? "Could not create your account";
    const alreadyExists = /already|registered|exists/i.test(message);
    return NextResponse.json(
      {
        error: alreadyExists
          ? "An account with that email already exists — sign in instead."
          : message,
      },
      { status: alreadyExists ? 409 : 500 }
    );
  }

  const authUserId = created.user.id;

  // Team Vitality is seed data in schema.sql; absent is not fatal, just unassigned.
  const { data: team } = await db
    .from("teams")
    .select("id")
    .eq("slug", "team-vitality")
    .maybeSingle();

  // users.strava_id doubles as the app-wide user id: a real athlete id for
  // OAuth users, the auth UUID for email users (see auth/email-session).
  const { error: profileError } = await db.from("users").upsert(
    {
      strava_id: authUserId,
      auth_user_id: authUserId,
      name,
      role: "champion",
      team_id: team?.id ?? null,
      onboarded: true,
      leaderboard_consent: false,
      rewards_export_consent: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "strava_id" }
  );

  if (profileError) {
    // Roll the auth user back rather than leaving an account that would sign in
    // as a plain 'member' and silently lose its champion status.
    await db.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: authUserId });
}
