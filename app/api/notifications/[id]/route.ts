import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getEffectiveUserId } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action } = await req.json();

  if (action !== "dismiss" && action !== "complete") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const updateData =
    action === "dismiss" ? { dismissed_at: now } : { completed_at: now };

  const { error } = await db
    .from("notifications")
    .update(updateData)
    .eq("id", id)
    .eq("user_strava_id", userId);

  if (error) {
    console.error("Notification update error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
