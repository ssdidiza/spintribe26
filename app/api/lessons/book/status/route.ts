import { NextRequest, NextResponse } from "next/server";
import { LessonPurchaseRow } from "@/lib/lessons";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Public: the confirmation page polls this with the (unguessable) reference to
// see whether PayFast has confirmed. No session needed — guests have no login.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  if (!reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("lesson_purchases")
    .select("id,kind,status,schedule_token,description,booking_starts_at,booking_duration_minutes,booking_location,customer_name,customer_email,customer_phone,lesson_count,total_amount_cents,currency,discount_amount_cents")
    .eq("payfast_reference", reference)
    .in("kind", ["direct", "cart"])
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const purchase = data as Pick<
    LessonPurchaseRow,
    | "id"
    | "kind"
    | "status"
    | "schedule_token"
    | "description"
    | "booking_starts_at"
    | "booking_duration_minutes"
    | "booking_location"
    | "customer_name"
    | "customer_email"
    | "customer_phone"
    | "lesson_count"
    | "total_amount_cents"
    | "currency"
    | "discount_amount_cents"
  >;
  const confirmed = purchase.status === "paid";

  // Sessions still to schedule (cart lines + Performance Block remainders).
  // The schedule token only travels once payment is confirmed.
  let remainingSessions = 0;
  if (confirmed) {
    const { data: items } = await db
      .from("lesson_purchase_items")
      .select("quantity_remaining")
      .eq("purchase_id", purchase.id);
    remainingSessions = (items ?? []).reduce((sum, item) => sum + Number(item.quantity_remaining ?? 0), 0);
  }

  return NextResponse.json({
    status: purchase.status,
    confirmed,
    kind: purchase.kind,
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
    remainingSessions,
    scheduleToken: confirmed && remainingSessions > 0 ? purchase.schedule_token : null,
  });
}
