import { NextRequest, NextResponse } from "next/server";
import { getLessonAvailability, isDateKey, lessonBookingWindowDays } from "@/lib/lesson-availability";
import { LessonServiceRow } from "@/lib/lesson-services";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-vercel-id");
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

  console.log(JSON.stringify({
    level: "info",
    message: "Lesson availability started",
    route: "/api/lessons/availability",
    requestId,
    serviceId,
  }));

  try {
    const db = supabaseAdmin();
    const serviceLookupStartedAt = Date.now();
    const servicePromise = db
      .from("lesson_services")
      .select("*")
      .eq("id", serviceId)
      .eq("active", true)
      .maybeSingle()
      .then((result) => ({ ...result, durationMs: Date.now() - serviceLookupStartedAt }));

    // The booking client always supplies its selected duration, so the global
    // calendar queries do not need to wait for the service validation query.
    const availabilityStartedAt = Date.now();
    const availabilityPromise = durationMinutes
      ? getLessonAvailability(
          db,
          { duration_minutes: durationMinutes } as LessonServiceRow,
          {
            fromDate: fromDate || undefined,
            days: Math.trunc(daysValue),
            expireHolds: false,
          }
        ).then((availability) => ({ availability, durationMs: Date.now() - availabilityStartedAt }))
      : null;

    const serviceResult = await servicePromise;
    const { data, error } = serviceResult;

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "That service is no longer available" }, { status: 404 });

    const service = data as LessonServiceRow;
    const availabilityResult = availabilityPromise
      ? await availabilityPromise
      : {
          availability: await getLessonAvailability(db, service, {
            fromDate: fromDate || undefined,
            days: Math.trunc(daysValue),
            expireHolds: false,
          }),
          durationMs: Date.now() - availabilityStartedAt,
        };
    const availability = availabilityResult.availability;

    console.log(JSON.stringify({
      level: "info",
      message: "Lesson availability completed",
      route: "/api/lessons/availability",
      requestId,
      serviceId,
      days: availability.length,
      serviceLookupMs: serviceResult.durationMs,
      availabilityQueryMs: availabilityResult.durationMs,
      durationMs: Date.now() - startedAt,
    }));

    return NextResponse.json(
      { availability },
      {
        headers: {
          // Slot selection is revalidated during booking. A tiny shared cache
          // removes repeat database work while keeping the calendar fresh.
          "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=45",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lesson availability";
    console.error(JSON.stringify({
      level: "error",
      message: "Lesson availability failed",
      route: "/api/lessons/availability",
      requestId,
      serviceId,
      error: message,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({ error: message, availability: [] }, { status: 500 });
  }
}
