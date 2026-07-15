import { NextRequest, NextResponse } from "next/server";
import { getLessonAvailability, isDateKey, lessonBookingWindowDays } from "@/lib/lesson-availability";
import { LessonServiceRow } from "@/lib/lesson-services";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const serviceId = req.nextUrl.searchParams.get("serviceId")?.trim();
  const fromDate = req.nextUrl.searchParams.get("from")?.trim();
  const daysValue = Number(req.nextUrl.searchParams.get("days") ?? lessonBookingWindowDays());
  // Package line items snapshot their duration at purchase time, which may
  // differ from the service's current duration — callers pass it explicitly.
  const durationValue = req.nextUrl.searchParams.get("durationMinutes");
  const durationMinutes = durationValue === null ? null : Number(durationValue);

  if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480)) {
    return NextResponse.json({ error: "durationMinutes must be between 15 and 480" }, { status: 400 });
  }
  if (fromDate && !isDateKey(fromDate)) {
    return NextResponse.json({ error: "from must be a date in YYYY-MM-DD format" }, { status: 400 });
  }
  if (!Number.isFinite(daysValue) || daysValue < 1 || daysValue > 60) {
    return NextResponse.json({ error: "days must be between 1 and 60" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("lesson_services")
      .select("*")
      .eq("id", serviceId)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "That service is no longer available" }, { status: 404 });

    const service = data as LessonServiceRow;
    const availability = await getLessonAvailability(
      db,
      durationMinutes ? { ...service, duration_minutes: durationMinutes } : service,
      {
        fromDate: fromDate || undefined,
        days: Math.trunc(daysValue),
      }
    );

    return NextResponse.json(
      { availability },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lesson availability";
    return NextResponse.json({ error: message, availability: [] }, { status: 500 });
  }
}
