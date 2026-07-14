import { NextRequest, NextResponse } from "next/server";
import {
  activateCartLessonPurchase,
  activateDirectLessonBooking,
  activateLessonPurchase,
} from "@/lib/lesson-payments";
import { LessonPurchaseItemRow, LessonPurchaseRow } from "@/lib/lessons";
import { dispatchCartPurchaseNotifications, dispatchLessonBookingNotifications } from "@/lib/notify";
import {
  isPayFastSourceIp,
  verifyPayFastItnSignature,
  verifyPayFastServerConfirmation,
} from "@/lib/payfast";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

function requestIp(req: NextRequest) {
  return (
    req.headers.get("x-vercel-forwarded-for") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip")
  )?.split(",")[0]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const reference = params.get("m_payment_id")?.trim();
  if (!reference) return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  if (!verifyPayFastItnSignature(params)) {
    return NextResponse.json({ error: "Invalid PayFast signature" }, { status: 401 });
  }
  if (!isPayFastSourceIp(requestIp(req))) {
    return NextResponse.json({ error: "Invalid PayFast source" }, { status: 403 });
  }
  if (params.get("merchant_id") !== process.env.PAYFAST_MERCHANT_ID?.trim()) {
    return NextResponse.json({ error: "PayFast merchant mismatch" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("lesson_purchases")
    .select("*")
    .eq("payfast_reference", reference)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: true, ignored: "unknown_reference" });

  const purchase = data as LessonPurchaseRow;
  if (params.get("custom_str1") !== purchase.id) {
    return NextResponse.json({ error: "PayFast purchase mismatch" }, { status: 400 });
  }
  if (Math.abs(Number(params.get("amount_gross")) - purchase.total_amount_cents / 100) > 0.01) {
    return NextResponse.json({ error: "PayFast amount mismatch" }, { status: 400 });
  }
  if (params.get("payment_status") !== "COMPLETE") {
    return NextResponse.json({ ok: true, ignored: params.get("payment_status") ?? "unknown_status" });
  }
  if (purchase.status === "paid") {
    return NextResponse.json({ ok: true, status: "already_paid" });
  }
  if (!(await verifyPayFastServerConfirmation(params))) {
    return NextResponse.json({ error: "PayFast server validation failed" }, { status: 400 });
  }

  const metadata = Object.fromEntries(params.entries());
  try {
    if (purchase.kind === "cart") {
      await activateCartLessonPurchase(db, purchase, {
        paidAt: new Date().toISOString(),
        paymentMetadata: metadata,
      });
      await db.from("lesson_purchases").update({
        payfast_payment_id: params.get("pf_payment_id"),
        updated_at: new Date().toISOString(),
      }).eq("id", purchase.id);

      // Best-effort: never let a notification failure fail the ITN ack.
      const { data: itemRows } = await db
        .from("lesson_purchase_items")
        .select("*")
        .eq("purchase_id", purchase.id);
      await dispatchCartPurchaseNotifications(db, {
        purchaseId: purchase.id,
        items: ((itemRows ?? []) as LessonPurchaseItemRow[]).map((item) => ({
          name: item.item_name,
          quantity: Number(item.quantity ?? 0),
          unitPriceCents: Number(item.unit_price_cents ?? 0),
        })),
        totalAmountCents: purchase.total_amount_cents,
        currency: purchase.currency,
        customerName: purchase.customer_name || "Guest rider",
        customerEmail: purchase.customer_email,
        customerPhone: purchase.customer_phone,
        scheduleToken: purchase.schedule_token,
        reference,
      }).catch(() => undefined);

      return NextResponse.json({ ok: true, status: "paid" });
    }

    if (purchase.kind === "direct") {
      const lessonSession = await activateDirectLessonBooking(db, purchase, {
        paidAt: new Date().toISOString(),
        paymentMetadata: metadata,
      });
      await db.from("lesson_purchases").update({
        payfast_payment_id: params.get("pf_payment_id"),
        updated_at: new Date().toISOString(),
      }).eq("id", purchase.id);

      // Performance Blocks carry a line-item balance: the remaining sessions
      // are scheduled from /schedule, so the confirmation carries that link.
      const { data: itemRows } = await db
        .from("lesson_purchase_items")
        .select("quantity_remaining")
        .eq("purchase_id", purchase.id);
      const remainingSessions = (itemRows ?? []).reduce(
        (sum, item) => sum + Number(item.quantity_remaining ?? 0),
        0
      );
      const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "").replace(/\/$/, "");
      const scheduleUrl = remainingSessions > 0 && origin && purchase.schedule_token
        ? `${origin}/schedule?token=${encodeURIComponent(purchase.schedule_token)}`
        : null;

      // Best-effort: never let a notification failure fail the ITN ack.
      await dispatchLessonBookingNotifications(db, {
        sessionId: lessonSession.id,
        serviceName: purchase.description || "Cycling lesson",
        startsAt: lessonSession.starts_at,
        endsAt: lessonSession.ends_at,
        durationMinutes: Number(lessonSession.duration_minutes ?? 60),
        location: lessonSession.location,
        notes: lessonSession.client_notes,
        customerName: purchase.customer_name || "Guest rider",
        customerEmail: purchase.customer_email,
        customerPhone: purchase.customer_phone,
        reference,
        scheduleUrl,
        remainingSessions,
      }).catch(() => undefined);

      return NextResponse.json({ ok: true, status: "paid" });
    }

    await activateLessonPurchase(db, purchase, {
      paidAt: new Date().toISOString(),
      paymentMetadata: metadata,
      reason: "PayFast ITN confirmed payment",
    });
    await db.from("lesson_purchases").update({
      payfast_payment_id: params.get("pf_payment_id"),
      updated_at: new Date().toISOString(),
    }).eq("id", purchase.id);
    return NextResponse.json({ ok: true, status: "paid" });
  } catch (activationError) {
    const message = activationError instanceof Error ? activationError.message : "Unable to activate lesson purchase";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
