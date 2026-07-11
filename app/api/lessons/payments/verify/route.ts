import { NextRequest, NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  if (!reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("lesson_purchases")
    .select("status")
    .eq("payfast_reference", reference)
    .eq("user_strava_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lesson purchase not found" }, { status: 404 });

  if (data.status === "paid") {
    return NextResponse.json({ ok: true, status: "paid" });
  }
  return NextResponse.json(
    { error: "PayFast confirmation is still being processed" },
    { status: 409 }
  );
}
