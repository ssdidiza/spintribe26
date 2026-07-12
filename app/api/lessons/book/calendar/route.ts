import { NextRequest } from "next/server";
import { buildLessonIcs } from "@/lib/ics";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

function coachEmail() {
  return process.env.LESSON_COACH_EMAIL?.trim() || process.env.FOUNDER_EMAIL?.trim() || "coach@spintribe.co.za";
}

function coachName() {
  return process.env.LESSON_COACH_NAME?.trim() || "SpinTribe Coaching";
}

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  if (!reference) return Response.json({ error: "reference is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("lesson_purchases")
    .select("id,status,description,booking_starts_at,booking_duration_minutes,booking_location,customer_name,customer_email")
    .eq("payfast_reference", reference)
    .eq("kind", "direct")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Booking not found" }, { status: 404 });
  if (data.status !== "paid") return Response.json({ error: "Booking is not confirmed yet" }, { status: 409 });
  if (!data.booking_starts_at) return Response.json({ error: "Booking has no scheduled time" }, { status: 409 });

  const startsAt = new Date(data.booking_starts_at);
  const durationMinutes = Number(data.booking_duration_minutes ?? 60);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const ics = buildLessonIcs({
    uid: `lesson-${data.id}@spintribe`,
    startsAt,
    endsAt,
    summary: `${data.description || "Cycling coaching"} - SpinTribe Coaching`,
    location: data.booking_location ?? "",
    organizerName: coachName(),
    organizerEmail: coachEmail(),
    attendeeName: data.customer_name ?? "SpinTribe rider",
    attendeeEmail: data.customer_email ?? coachEmail(),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="spintribe-coaching-${reference}.ics"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

