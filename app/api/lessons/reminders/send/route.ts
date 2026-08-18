import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured, sendDailyLessonEmailReminders } from "@/lib/lesson-reminders";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Daily 04:00 SAST cron (see vercel.json): short email reminder to every
// rider with a session later today. Guarded like /api/leagues/assign-monthly.
function verifyCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? process.env.LEAGUE_JOB_SECRET;
  if (!expected && process.env.NODE_ENV === "production") return false;
  if (!expected) return true;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${expected}` || headerSecret === expected;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true, skipped: "email_not_configured" });
  }

  try {
    const summary = await sendDailyLessonEmailReminders(supabaseAdmin());
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send reminders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
