import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";

export const runtime = "nodejs";

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const [rulesResult, blackoutsResult] = await Promise.all([
    ctx.db.from("lesson_availability_rules").select("*").order("weekday").order("start_time"),
    ctx.db.from("lesson_blackouts").select("*").gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  if (rulesResult.error) return NextResponse.json({ error: rulesResult.error.message }, { status: 500 });
  if (blackoutsResult.error) return NextResponse.json({ error: blackoutsResult.error.message }, { status: 500 });

  return NextResponse.json({ rules: rulesResult.data ?? [], blackouts: blackoutsResult.data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const weekday = Number(body.weekday);
  const startTime = String(body.startTime ?? "").slice(0, 5);
  const endTime = String(body.endTime ?? "").slice(0, 5);
  const active = Boolean(body.active);

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: "weekday must be between 0 and 6" }, { status: 400 });
  }
  if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
    return NextResponse.json({ error: "Choose a valid start and end time" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("lesson_availability_rules")
    .upsert({
      weekday,
      start_time: startTime,
      end_time: endTime,
      active,
      updated_at: new Date().toISOString(),
    }, { onConflict: "weekday" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const startsAt = new Date(String(body.startsAt ?? ""));
  const endsAt = new Date(String(body.endsAt ?? ""));
  const reason = String(body.reason ?? "").trim().slice(0, 200);

  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Choose a valid blackout start and end" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("lesson_blackouts")
    .insert({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), reason })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blackout: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await ctx.db.from("lesson_blackouts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
