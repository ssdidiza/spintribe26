import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonPurchaseRow, LessonSessionRow } from "@/lib/lessons";
import { recordXeroPaymentForLessonPurchase } from "@/lib/xero";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Direct (public, single-session) booking: payment confirmed → mark paid and
 * materialise the booked session from the slot stored on the purchase. No
 * wallet/credit ledger — that's the member-only path. Idempotent on ITN retry.
 */
export async function activateDirectLessonBooking(
  db: SupabaseClient,
  purchase: LessonPurchaseRow,
  input: { paidAt: string; paymentMetadata?: Record<string, unknown> | null }
): Promise<LessonSessionRow> {
  const paidAt = input.paidAt || new Date().toISOString();

  const { data: existing, error: existingError } = await db
    .from("lesson_sessions")
    .select("*")
    .eq("purchase_id", purchase.id)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  let session: LessonSessionRow;
  if (existing) {
    const row = existing as LessonSessionRow;
    if (row.status === "booked") {
      session = row;
    } else {
      if (row.status !== "pending_payment" && row.status !== "cancelled") {
        throw new Error(`Lesson session cannot be activated from ${row.status}`);
      }
      const { data: activated, error: activateError } = await db
        .from("lesson_sessions")
        .update({ status: "booked", hold_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select("*")
        .single();
      if (activateError) throw activateError;
      session = activated as LessonSessionRow;
    }
  } else {
    const durationMinutes = Number(purchase.booking_duration_minutes ?? 60);
    const startsAt = purchase.booking_starts_at ?? paidAt;
    const endsAt = new Date(new Date(startsAt).getTime() + durationMinutes * 60 * 1000).toISOString();
    const clientNotes =
      purchase.payfast_metadata && typeof purchase.payfast_metadata === "object"
        ? String((purchase.payfast_metadata as Record<string, unknown>).clientNotes ?? "")
        : "";

    const { data: created, error: sessionError } = await db
      .from("lesson_sessions")
      .insert({
        purchase_id: purchase.id,
        user_strava_id: null,
        service_id: purchase.service_id,
        status: "booked",
        starts_at: startsAt,
        ends_at: endsAt,
        duration_minutes: durationMinutes,
        credit_amount: 1,
        location: purchase.booking_location ?? "",
        customer_name: purchase.customer_name,
        customer_email: purchase.customer_email,
        customer_phone: purchase.customer_phone,
        client_notes: clientNotes,
      })
      .select("*")
      .single();

    if (sessionError) throw sessionError;
    session = created as LessonSessionRow;
  }

  const { error: purchaseError } = await db
    .from("lesson_purchases")
    .update({
      status: "paid",
      paid_at: purchase.paid_at ?? paidAt,
      payfast_paid_at: purchase.payfast_paid_at ?? paidAt,
      payfast_metadata: input.paymentMetadata ?? purchase.payfast_metadata ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchase.id);
  if (purchaseError) throw purchaseError;

  return session;
}

/**
 * Cart (multi-session) purchase: payment confirmed → mark paid. No session is
 * created here — the rider schedules each session from /schedule against the
 * purchase's line-item balances. Idempotent on ITN retry.
 */
export async function activateCartLessonPurchase(
  db: SupabaseClient,
  purchase: LessonPurchaseRow,
  input: {
    paidAt: string;
    payfastPaymentId?: string | null;
    paymentMetadata?: Record<string, unknown> | null;
  }
) {
  const paidAt = input.paidAt || new Date().toISOString();
  const { error: updateError } = await db
    .from("lesson_purchases")
    .update({
      status: "paid",
      paid_at: purchase.paid_at ?? paidAt,
      payfast_paid_at: purchase.payfast_paid_at ?? paidAt,
      payfast_payment_id: input.payfastPaymentId ?? purchase.payfast_payment_id ?? null,
      payfast_metadata: input.paymentMetadata ?? purchase.payfast_metadata ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchase.id);
  if (updateError) throw updateError;

  if (purchase.xero_invoice_id && purchase.payfast_reference) {
    try {
      await recordXeroPaymentForLessonPurchase({
        invoiceId: purchase.xero_invoice_id,
        amountCents: purchase.total_amount_cents,
        reference: purchase.payfast_reference,
        paidAt,
      });
    } catch (error) {
      await db
        .from("lesson_purchases")
        .update({
          xero_sync_status: "error",
          xero_error: errorMessage(error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    }
  }
}

export async function activateLessonPurchase(
  db: SupabaseClient,
  purchase: LessonPurchaseRow,
  input: {
    paidAt: string;
    paymentMetadata?: Record<string, unknown> | null;
    actorId?: string | null;
    reason?: string;
    markPaymentPaid?: boolean;
  }
) {
  const paidAt = input.paidAt || new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: "paid",
    paid_at: purchase.paid_at ?? paidAt,
    updated_at: new Date().toISOString(),
  };
  if (input.markPaymentPaid !== false) {
    updatePayload.payfast_paid_at = purchase.payfast_paid_at ?? paidAt;
    updatePayload.payfast_metadata = input.paymentMetadata ?? purchase.payfast_metadata ?? null;
  }

  const { error: updateError } = await db
    .from("lesson_purchases")
    .update(updatePayload)
    .eq("id", purchase.id);

  if (updateError) throw updateError;

  const { data: existingLedger, error: ledgerLookupError } = await db
    .from("lesson_credit_ledger")
    .select("id")
    .eq("purchase_id", purchase.id)
    .eq("event_type", "purchase_activated")
    .limit(1);

  if (ledgerLookupError) throw ledgerLookupError;

  if (!existingLedger?.length) {
    const { error: ledgerError } = await db.from("lesson_credit_ledger").insert({
      purchase_id: purchase.id,
      user_strava_id: purchase.user_strava_id,
      event_type: "purchase_activated",
      credit_delta: purchase.lesson_count,
      reason: input.reason ?? "PayFast payment confirmed",
      created_by: input.actorId ?? null,
      metadata: input.paymentMetadata ?? null,
    });

    if (ledgerError) throw ledgerError;
  }

  if (purchase.xero_invoice_id && purchase.payfast_reference) {
    try {
      await recordXeroPaymentForLessonPurchase({
        invoiceId: purchase.xero_invoice_id,
        amountCents: purchase.total_amount_cents,
        reference: purchase.payfast_reference,
        paidAt,
      });
    } catch (error) {
      await db
        .from("lesson_purchases")
        .update({
          xero_sync_status: "error",
          xero_error: errorMessage(error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    }
  }
}
