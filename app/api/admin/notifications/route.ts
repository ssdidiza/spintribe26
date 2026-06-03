import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { data, error } = await ctx.db
    .from("notifications")
    .select("id,user_strava_id,type,title,body,dismissed_at,completed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const message = String(body.body ?? "").trim();
  if (!title || !message) {
    return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
  }

  const { data: users, error: usersError } = await ctx.db
    .from("users")
    .select("strava_id")
    .eq("onboarded", true);

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const rows = (users ?? []).map((user) => ({
    user_strava_id: user.strava_id,
    type: "info",
    title,
    body: message,
  }));

  if (rows.length) {
    const { error } = await ctx.db.from("notifications").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
