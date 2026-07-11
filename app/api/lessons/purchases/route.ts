import { NextRequest, NextResponse } from "next/server";
import {
  LESSON_CURRENCY,
  calculateLessonPurchase,
  buildLessonSummary,
  LessonLedgerRow,
  LessonPurchaseRow,
  LessonSessionRow,
  serializeLessonPurchase,
  serializeLessonSession,
} from "@/lib/lessons";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { createPayFastCheckoutUrl, isPayFastConfigured } from "@/lib/payfast";
import { createXeroInvoiceForLessonPurchase, isXeroConfigured } from "@/lib/xero";
import { activateLessonPurchase } from "@/lib/lesson-payments";

function getRequestOrigin(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : req.nextUrl.origin;
}

function isValidEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function loadLessonWallet(db: ReturnType<typeof supabaseAdmin>, userId: string) {
  const [purchasesResult, sessionsResult, ledgerResult] = await Promise.all([
    db
      .from("lesson_purchases")
      .select("*")
      .eq("user_strava_id", userId)
      .order("created_at", { ascending: false }),
    db
      .from("lesson_sessions")
      .select("*")
      .eq("user_strava_id", userId)
      .order("starts_at", { ascending: true }),
    db
      .from("lesson_credit_ledger")
      .select("*")
      .eq("user_strava_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (purchasesResult.error) throw purchasesResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const purchases = (purchasesResult.data ?? []) as LessonPurchaseRow[];
  const sessions = (sessionsResult.data ?? []) as LessonSessionRow[];
  const ledger = (ledgerResult.data ?? []) as LessonLedgerRow[];

  return {
    summary: buildLessonSummary(purchases, sessions, ledger),
    purchases: purchases.map(serializeLessonPurchase),
    sessions: sessions.map(serializeLessonSession),
    ledger: ledger.map((row) => ({
      id: row.id,
      purchaseId: row.purchase_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      creditDelta: Number(row.credit_delta ?? 0),
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}

export async function GET() {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = supabaseAdmin();
    return NextResponse.json(await loadLessonWallet(db, userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lesson wallet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  const { data: caller, error: callerError } = await db
    .from("users")
    .select("strava_id,name,role,onboarded")
    .eq("strava_id", userId)
    .maybeSingle();

  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 500 });
  if (!caller?.onboarded) return NextResponse.json({ error: "Finish onboarding before buying lessons" }, { status: 403 });

  const isAdmin = caller.role === "admin";
  const requestedUserId = body.userId ? String(body.userId) : userId;
  if (requestedUserId !== userId && !isAdmin) {
    return NextResponse.json({ error: "You can only create your own lesson package" }, { status: 403 });
  }

  const { data: targetUser, error: targetUserError } = await db
    .from("users")
    .select("strava_id,name,onboarded")
    .eq("strava_id", requestedUserId)
    .maybeSingle();

  if (targetUserError) return NextResponse.json({ error: targetUserError.message }, { status: 500 });
  if (!targetUser) return NextResponse.json({ error: "Rider not found" }, { status: 404 });

  const lessonCount = Number(body.lessonCount ?? 0);
  if (!Number.isFinite(lessonCount) || lessonCount <= 0 || lessonCount > 200) {
    return NextResponse.json({ error: "lessonCount must be between 1 and 200" }, { status: 400 });
  }

  const markPaid = isAdmin && body.markPaid === true;
  const createPayment = !markPaid && body.createPayment !== false;
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  const canInitializePayFast = createPayment && isPayFastConfigured();
  if (canInitializePayFast && !isValidEmail(customerEmail)) {
    return NextResponse.json({ error: "A valid email is required for PayFast payment" }, { status: 400 });
  }

  const pricing = calculateLessonPurchase({
    lessonCount,
    discountPercent: isAdmin ? Number(body.discountPercent ?? 0) : 0,
    currency: LESSON_CURRENCY,
  });

  const description = String(body.description ?? "Cycling lesson package").trim().slice(0, 180);
  const existingXeroInvoiceNumber = isAdmin
    ? String(body.xeroInvoiceNumber ?? "").trim().slice(0, 80)
    : "";
  const syncXero = body.syncXero !== false;
  const { data: inserted, error: insertError } = await db
    .from("lesson_purchases")
    .insert({
      user_strava_id: requestedUserId,
      created_by: userId,
      lesson_count: pricing.lessonCount,
      unit_price_cents: pricing.unitPriceCents,
      discount_percent: pricing.discountPercent,
      gross_amount_cents: pricing.grossAmountCents,
      discount_amount_cents: pricing.discountAmountCents,
      total_amount_cents: pricing.totalAmountCents,
      currency: pricing.currency,
      status: "draft",
      description,
      customer_email: isValidEmail(customerEmail) ? customerEmail : null,
      xero_invoice_number: existingXeroInvoiceNumber || null,
      xero_sync_status: existingXeroInvoiceNumber ? "synced" : "not_configured",
    })
    .select("*")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  let purchase = inserted as LessonPurchaseRow;
  let xeroWarning: string | null = null;
  let paymentUnavailable = createPayment && !isPayFastConfigured();

  if (syncXero && !existingXeroInvoiceNumber && isXeroConfigured()) {
    await db
      .from("lesson_purchases")
      .update({ xero_sync_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", purchase.id);

    try {
      const invoice = await createXeroInvoiceForLessonPurchase({
        purchaseId: purchase.id,
        contactName: targetUser.name || "SpinTribe rider",
        contactEmail: isValidEmail(customerEmail) ? customerEmail : undefined,
        lessonCount: pricing.lessonCount,
        unitPriceCents: pricing.unitPriceCents,
        discountPercent: pricing.discountPercent,
        currency: pricing.currency,
        description,
      });

      if (invoice) {
        const { data: updated, error: updateError } = await db
          .from("lesson_purchases")
          .update({
            xero_invoice_id: invoice.invoiceId,
            xero_invoice_number: invoice.invoiceNumber,
            xero_invoice_url: invoice.invoiceUrl,
            xero_sync_status: "synced",
            xero_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id)
          .select("*")
          .single();

        if (updateError) throw updateError;
        purchase = updated as LessonPurchaseRow;
      }
    } catch (error) {
      xeroWarning = error instanceof Error ? error.message : "Xero invoice sync failed";
      await db
        .from("lesson_purchases")
        .update({
          xero_sync_status: "error",
          xero_error: xeroWarning.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    }
  }

  if (markPaid) {
    try {
      await activateLessonPurchase(db, purchase, {
        paidAt: new Date().toISOString(),
        actorId: userId,
        reason: "Admin imported an already-paid lesson package",
        markPaymentPaid: false,
      });

      const { data: paidPurchase, error: paidPurchaseError } = await db
        .from("lesson_purchases")
        .select("*")
        .eq("id", purchase.id)
        .single();

      if (paidPurchaseError) throw paidPurchaseError;
      purchase = paidPurchase as LessonPurchaseRow;
      const wallet = await loadLessonWallet(db, requestedUserId);
      return NextResponse.json({
        ...wallet,
        purchase: serializeLessonPurchase(purchase),
        payment: null,
        paymentUnavailable: false,
        xeroWarning,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to activate paid lesson package";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let payment: { authorizationUrl: string; reference: string } | null = null;
  if (canInitializePayFast) {
    const reference = `STL-${Date.now()}-${purchase.id.slice(0, 8)}`;

    try {
      const authorizationUrl = createPayFastCheckoutUrl({
        origin: getRequestOrigin(req),
        purchaseId: purchase.id,
        reference,
      });

      const { data: updated, error: updateError } = await db
        .from("lesson_purchases")
        .update({
          status: "pending_payment",
          payfast_reference: reference,
          payfast_checkout_url: authorizationUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchase.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      purchase = updated as LessonPurchaseRow;
      payment = { authorizationUrl, reference };
    } catch (error) {
      paymentUnavailable = true;
      const initializationError = error instanceof Error ? error.message : "PayFast checkout initialization failed";
      await db
        .from("lesson_purchases")
        .update({
          payfast_metadata: { initializationError: initializationError.slice(0, 1000) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    }
  }

  const wallet = await loadLessonWallet(db, requestedUserId);
  return NextResponse.json({
    ...wallet,
    purchase: serializeLessonPurchase(purchase),
    payment,
    paymentUnavailable,
    xeroWarning,
  });
}
