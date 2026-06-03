import { NextRequest, NextResponse } from "next/server";
import { getFeedbackBoard } from "@/lib/feedback-data";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { FeedbackCategory } from "@/lib/types";

const VALID_CATEGORIES: FeedbackCategory[] = ["bug", "idea", "confusing", "request", "other"];

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const items = await getFeedbackBoard(supabaseAdmin(), userId);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feedback fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = cleanText(body.title, 120);
  const message = cleanText(body.body, 2000);
  const category = VALID_CATEGORIES.includes(body.category) ? body.category : "idea";

  if (title.length < 3 || message.length < 3) {
    return NextResponse.json({ error: "Title and detail are required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: item, error } = await db
    .from("feedback_items")
    .insert({
      user_strava_id: userId,
      title,
      body: message,
      category,
      last_message_at: new Date().toISOString(),
    })
    .select("id,title")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: admins } = await db.from("users").select("strava_id").eq("role", "admin");
  const adminNotifications = (admins ?? []).map((admin) => ({
    user_strava_id: admin.strava_id,
    type: "info",
    title: "New beta feedback",
    body: title,
  }));

  if (adminNotifications.length) {
    await db.from("notifications").insert(adminNotifications);
  }

  return NextResponse.json({ ok: true, id: item.id });
}
