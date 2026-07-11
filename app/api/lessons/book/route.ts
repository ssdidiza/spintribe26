import { NextRequest, NextResponse } from "next/server";
import { LESSON_CURRENCY, calculateLessonPurchase, LessonPurchaseRow } from "@/lib/lessons";
import { LessonServiceRow } from "@/lib/lesson-services";
import {
  getLessonAvailability,
  isSlotConstraintError,
  johannesburgDateKey,
  LESSON_HOLD_MINUTES,
} from "@/lib/lesson-availability";
import { supabaseAdmin } from "@/lib/supabase";
import { createPayFastCheckoutUrl, isPayFastConfigured } from "@/lib/payfast";
import { getEffectiveUserId, getSession } from "@/lib/session";

export const runtime = "nodejs";

function getRequestOrigin(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : req.nextUrl.origin;
}

function isValidEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Public, no-auth: a beginner books and pays for a single session. No Strava,
// no wallet. On PayFast confirmation the session is materialised (notify route).
export async function POST(req: NextRequest) {
  if (!isPayFastConfigured()) {
    return NextResponse.json({ error: "Online booking is not available yet. Please contact us." }, { status: 503 });
  }

  const signedInUserId = getEffectiveUserId(await getSession());
  const body = await req.json().catch(() => ({}));
  const serviceId = String(body.serviceId ?? "").trim();
  const customerName = String(body.customerName ?? "").trim().slice(0, 120);
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  const customerPhone = String(body.customerPhone ?? "").trim().slice(0, 40);
  const location = String(body.location ?? "").trim().slice(0, 160);
  const notes = String(body.notes ?? "").trim().slice(0, 500);
  const startsAtValue = String(body.startsAt ?? "");

  if (!serviceId) return NextResponse.json({ error: "Please choose a service" }, { status: 400 });
  if (customerName.length < 2) return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  if (!isValidEmail(customerEmail)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const startsAt = new Date(startsAtValue);
  if (!Number.isFinite(startsAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid date and time" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: serviceRow, error: serviceError } = await db
    .from("lesson_services")
    .select("*")
    .eq("id", serviceId)
    .eq("active", true)
    .maybeSingle();

  if (serviceError) return NextResponse.json({ error: serviceError.message }, { status: 500 });
  if (!serviceRow) return NextResponse.json({ error: "That service is no longer available" }, { status: 404 });

  const service = serviceRow as LessonServiceRow;
  const durationMinutes = Number(service.duration_minutes ?? 60);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const requestedDate = johannesburgDateKey(startsAt);
  const [day] = await getLessonAvailability(db, service, { fromDate: requestedDate, days: 1 });
  const isAvailable = day?.slots.some((slot) => new Date(slot).getTime() === startsAt.getTime());
  if (!isAvailable) {
    return NextResponse.json({ error: "That time was just taken. Please pick another slot." }, { status: 409 });
  }

  const pricing = calculateLessonPurchase({
    lessonCount: 1,
    unitPriceCents: Number(service.price_cents ?? 0),
    currency: service.currency ?? LESSON_CURRENCY,
  });

  const purchaseId = crypto.randomUUID();
  const reference = `STD-${Date.now()}-${purchaseId.slice(0, 8)}`;
  const authorizationUrl = createPayFastCheckoutUrl({
    origin: getRequestOrigin(req),
    purchaseId,
    reference,
  });
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + LESSON_HOLD_MINUTES * 60 * 1000).toISOString();

  const { data: inserted, error: insertError } = await db
    .from("lesson_purchases")
    .insert({
      id: purchaseId,
      user_strava_id: null,
      created_by: signedInUserId,
      kind: "direct",
      service_id: service.id,
      lesson_count: 1,
      unit_price_cents: pricing.unitPriceCents,
      discount_percent: 0,
      gross_amount_cents: pricing.grossAmountCents,
      discount_amount_cents: 0,
      total_amount_cents: pricing.totalAmountCents,
      currency: pricing.currency,
      status: "pending_payment",
      description: service.name,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      booking_starts_at: startsAt.toISOString(),
      booking_duration_minutes: durationMinutes,
      booking_location: location || null,
      payfast_reference: reference,
      payfast_checkout_url: authorizationUrl,
      payfast_metadata: notes ? { clientNotes: notes } : null,
      xero_sync_status: "not_configured",
    })
    .select("*")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const purchase = inserted as LessonPurchaseRow;
  const { error: sessionError } = await db.from("lesson_sessions").insert({
    purchase_id: purchase.id,
    user_strava_id: signedInUserId,
    service_id: service.id,
    status: "pending_payment",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: durationMinutes,
    credit_amount: 1,
    location: location || "",
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone || null,
    client_notes: notes,
    hold_expires_at: holdExpiresAt,
  });

  if (sessionError) {
    await db
      .from("lesson_purchases")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", purchase.id);
    if (isSlotConstraintError(sessionError)) {
      return NextResponse.json({ error: "That time was just taken. Please pick another slot." }, { status: 409 });
    }
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  return NextResponse.json({ authorizationUrl, reference, holdExpiresAt });
}
