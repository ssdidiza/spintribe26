import { NextRequest, NextResponse } from "next/server";
import { LessonPurchaseRow } from "@/lib/lessons";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Public: the confirmation page polls this with the (unguessable) reference to
// see whether PayFast has confirmed. No session needed — guests have no login.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  if (!reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("lesson_purchases")
    .select("status,description,booking_starts_at,booking_duration_minutes,booking_location,customer_name,customer_email,customer_phone,lesson_count,total_amount_cents,currency,discount_amount_cents")
    .eq("payfast_reference", reference)
    .eq("kind", "direct")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const purchase = data as Partial<LessonPurchaseRow> & {
    booking_starts_at?: string | null;
    booking_duration_minutes?: number | null;
    booking_location?: string | null;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    lesson_count?: number | string | null;
    total_amount_cents?: number | null;
    currency?: string | null;
    discount_amount_cents?: number | null;
  };

  return NextResponse.json({
    status: purchase.status,
    confirmed: purchase.status === "paid",
    service: purchase.description ?? "Cycling lesson",
    customerName: purchase.customer_name ?? "",
    customerEmail: purchase.customer_email ?? null,
    customerPhone: purchase.customer_phone ?? null,
    startsAt: purchase.booking_starts_at ?? null,
    durationMinutes: purchase.booking_duration_minutes ?? null,
    location: purchase.booking_location ?? null,
    lessonCount: Number(purchase.lesson_count ?? 1),
    totalAmountCents: Number(purchase.total_amount_cents ?? 0),
    currency: purchase.currency ?? "ZAR",
    discountAmountCents: Number(purchase.discount_amount_cents ?? 0),
  });
}
