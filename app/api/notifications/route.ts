import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getEffectiveUserId } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_strava_id", userId)
    .is("dismissed_at", null)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Notifications fetch error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const notifications = (data ?? []).map((n) => ({
    id: String(n.id),
    userId: n.user_strava_id,
    type: n.type,
    title: n.title,
    body: n.body,
    dismissedAt: n.dismissed_at ?? undefined,
    completedAt: n.completed_at ?? undefined,
    createdAt: n.created_at,
  }));

  return NextResponse.json({ notifications });
}
