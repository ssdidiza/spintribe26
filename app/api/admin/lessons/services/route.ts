import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { LessonServiceRow, serializeLessonService } from "@/lib/lesson-services";

export const runtime = "nodejs";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function readServiceInput(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim().slice(0, 120);
  const description = String(body.description ?? "").trim().slice(0, 600);
  const durationMinutes = Math.round(Number(body.durationMinutes ?? 60));
  const priceCents = Math.round(Number(body.priceCents ?? 0));
  const sortOrder = Math.round(Number(body.sortOrder ?? 0));
  const active = body.active === undefined ? true : Boolean(body.active);

  if (name.length < 2) return { error: "Name is required" as const };
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    return { error: "Duration must be between 15 and 480 minutes" as const };
  }
  if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 100_000_00) {
    return { error: "Enter a valid price" as const };
  }
  return { name, description, durationMinutes, priceCents, sortOrder, active };
}

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await ctx.db
    .from("lesson_services")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    services: ((data ?? []) as LessonServiceRow[]).map(serializeLessonService),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const input = readServiceInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const slug = `${slugify(input.name) || "lesson"}-${Date.now().toString(36)}`;
  const { data, error } = await ctx.db
    .from("lesson_services")
    .insert({
      slug,
      name: input.name,
      description: input.description,
      duration_minutes: input.durationMinutes,
      price_cents: input.priceCents,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ service: serializeLessonService(data as LessonServiceRow) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Allow a lightweight active-only toggle, or a full edit.
  if (Object.keys(body).length === 2 && "active" in body) {
    const { data, error } = await ctx.db
      .from("lesson_services")
      .update({ active: Boolean(body.active), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ service: serializeLessonService(data as LessonServiceRow) });
  }

  const input = readServiceInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const { data, error } = await ctx.db
    .from("lesson_services")
    .update({
      name: input.name,
      description: input.description,
      duration_minutes: input.durationMinutes,
      price_cents: input.priceCents,
      sort_order: input.sortOrder,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ service: serializeLessonService(data as LessonServiceRow) });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await ctx.db.from("lesson_services").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
