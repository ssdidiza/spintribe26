import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

function cleanMessage(value: unknown) {
  return String(value ?? "").trim().slice(0, 2000);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const message = cleanMessage(body.body);

  if (message.length < 1) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const [{ data: item, error: itemError }, { data: caller, error: callerError }] = await Promise.all([
    db
      .from("feedback_items")
      .select("id,user_strava_id,title")
      .eq("id", id)
      .maybeSingle(),
    db
      .from("users")
      .select("strava_id,role")
      .eq("strava_id", userId)
      .maybeSingle(),
  ]);

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const isAdmin = caller?.role === "admin";
  const isOwner = String(item.user_strava_id) === userId;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Only the author or an admin can respond" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: saved, error } = await db
    .from("feedback_messages")
    .insert({
      feedback_item_id: id,
      user_strava_id: userId,
      body: message,
      is_admin: isAdmin,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const update: Record<string, unknown> = {
    last_message_at: now,
    updated_at: now,
  };
  if (isAdmin) update.admin_summary = message;

  await db.from("feedback_items").update(update).eq("id", id);

  if (isAdmin && !isOwner) {
    await db.from("notifications").insert({
      user_strava_id: item.user_strava_id,
      type: "info",
      title: "Admin replied to your feedback",
      body: item.title,
    });
  }

  return NextResponse.json({ ok: true, id: saved.id });
}
