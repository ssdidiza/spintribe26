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
import { coachingPackagePricing, findCoachingPackageTier } from "@/lib/coaching-packages";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { createXeroInvoiceForLessonPurchase, isXeroConfigured } from "@/lib/xero";

export const runtime = "nodejs";

const CART_MAX_LINES = 8;
const CART_MAX_PER_LINE = 10;
const CART_MAX_SESSIONS = 20;

function getRequestOrigin(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : req.nextUrl.origin;
}

function isValidEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Public, no-auth: a rider books and pays for one session, a Performance
// Block, or a cart of sessions. No Strava, no wallet.
// - One session: the slot is held now; PayFast confirmation materialises it.
// - Block/cart: payment first; sessions are scheduled afterwards from
//   /schedule against the purchase's line-item balances.
export async function POST(req: NextRequest) {
  if (!isPayFastConfigured()) {
    return NextResponse.json({ error: "Online booking is not available yet. Please contact us." }, { status: 503 });
  }

  const signedInUserId = getEffectiveUserId(await getSession());
  const body = await req.json().catch(() => ({}));
  const customerName = String(body.customerName ?? "").trim().slice(0, 120);
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  const customerPhone = String(body.customerPhone ?? "").trim().slice(0, 40);
  const location = String(body.location ?? "").trim().slice(0, 160);
  const notes = String(body.notes ?? "").trim().slice(0, 500);
  const startsAtValue = String(body.startsAt ?? "");
  const packageTier = findCoachingPackageTier(String(body.packageTierId ?? "").trim());

  const rawItems = Array.isArray(body.items) ? (body.items as unknown[]) : [];
  const cartItems = rawItems
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        serviceId: String(record.serviceId ?? "").trim(),
        quantity: Math.trunc(Number(record.quantity)),
      };
    })
    .filter((item) => item.serviceId && Number.isFinite(item.quantity) && item.quantity > 0);
  const legacyServiceId = String(body.serviceId ?? "").trim();
  const lines = cartItems.length
    ? cartItems
    : legacyServiceId
      ? [{ serviceId: legacyServiceId, quantity: 1 }]
      : [];
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  if (!lines.length) return NextResponse.json({ error: "Please choose a service" }, { status: 400 });
  if (lines.length > CART_MAX_LINES || totalQuantity > CART_MAX_SESSIONS || lines.some((line) => line.quantity > CART_MAX_PER_LINE)) {
    return NextResponse.json({ error: "That's more sessions than one checkout supports. Please contact us." }, { status: 400 });
  }
  if (new Set(lines.map((line) => line.serviceId)).size !== lines.length) {
    return NextResponse.json({ error: "Each service can only appear once" }, { status: 400 });
  }
  if (customerName.length < 2) return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  if (!isValidEmail(customerEmail)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  if (!normalizeWhatsAppNumber(customerPhone)) {
    return NextResponse.json({ error: "Please enter a valid WhatsApp number (e.g. 071 234 5678)" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const serviceIds = lines.map((line) => line.serviceId);
  const { data: serviceRows, error: servicesError } = await db
    .from("lesson_services")
    .select("*")
    .in("id", serviceIds)
    .eq("active", true);
  if (servicesError) return NextResponse.json({ error: servicesError.message }, { status: 500 });

  const services = new Map((serviceRows ?? []).map((row) => [String((row as LessonServiceRow).id), row as LessonServiceRow]));
  if (services.size !== serviceIds.length) {
    return NextResponse.json({ error: "One of those services is no longer available" }, { status: 404 });
  }
  const currencies = new Set(Array.from(services.values()).map((service) => service.currency ?? LESSON_CURRENCY));
  if (currencies.size > 1) {
    return NextResponse.json({ error: "Services with different currencies cannot share one checkout" }, { status: 400 });
  }

  const customer = {
    customerName,
    customerEmail,
    customerPhone,
    location,
    notes,
    signedInUserId,
  };

  // Multi-session cart (and no block tier): pay now, schedule after.
  if (!packageTier && totalQuantity > 1) {
    return createCartCheckout(req, db, lines.map((line) => ({
      service: services.get(line.serviceId) as LessonServiceRow,
      quantity: line.quantity,
    })), customer);
  }

  // Single session or Performance Block: the chosen slot is held before payment.
  const service = services.get(serviceIds[0]) as LessonServiceRow;
  const startsAt = new Date(startsAtValue);
  if (!Number.isFinite(startsAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid date and time" }, { status: 400 });
  }

  const schedulingService = packageTier
    ? ({ ...service, duration_minutes: packageTier.durationMinutes } as LessonServiceRow)
    : service;
  const durationMinutes = Number(schedulingService.duration_minutes ?? 60);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const requestedDate = johannesburgDateKey(startsAt);
  const [day] = await getLessonAvailability(db, schedulingService, { fromDate: requestedDate, days: 1 });
  const isAvailable = day?.slots.some((slot) => new Date(slot).getTime() === startsAt.getTime());
  if (!isAvailable) {
    return NextResponse.json({ error: "That time was just taken. Please pick another slot." }, { status: 409 });
  }

  const pricing = packageTier
    ? coachingPackagePricing(packageTier)
    : calculateLessonPurchase({
        lessonCount: 1,
        unitPriceCents: Number(service.price_cents ?? 0),
        currency: service.currency ?? LESSON_CURRENCY,
      });
  const description = packageTier ? packageTier.name : service.name;
  const payfastMetadata: Record<string, unknown> = {};
  if (notes) payfastMetadata.clientNotes = notes;
  if (packageTier) {
    payfastMetadata.packageTierId = packageTier.id;
    payfastMetadata.packageName = packageTier.name;
    payfastMetadata.packageSessions = packageTier.sessions;
    payfastMetadata.packageRemainingSessions = Math.max(0, packageTier.sessions - 1);
    payfastMetadata.packageCompareAtCents = packageTier.compareAtCents;
  }

  const purchaseId = crypto.randomUUID();
  // This reference gates the public confirmation/status endpoints, so retain
  // the full UUID entropy rather than truncating it to eight hex characters.
  const reference = `STD-${purchaseId}`;
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
      lesson_count: pricing.lessonCount,
      unit_price_cents: pricing.unitPriceCents,
      discount_percent: pricing.discountPercent,
      gross_amount_cents: pricing.grossAmountCents,
      discount_amount_cents: pricing.discountAmountCents,
      total_amount_cents: pricing.totalAmountCents,
      currency: pricing.currency,
      status: "pending_payment",
      description,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      booking_starts_at: startsAt.toISOString(),
      booking_duration_minutes: durationMinutes,
      booking_location: location || null,
      payfast_reference: reference,
      payfast_checkout_url: authorizationUrl,
      payfast_metadata: Object.keys(payfastMetadata).length ? payfastMetadata : null,
      xero_sync_status: "not_configured",
    })
    .select("*")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const purchase = inserted as LessonPurchaseRow;

  // Performance Block: the full session balance lives on a line item, so the
  // remaining sessions are schedulable from /schedule after payment (the
  // first one is consumed by the slot held below).
  let purchaseItemId: string | null = null;
  if (packageTier) {
    const { data: itemRow, error: itemError } = await db
      .from("lesson_purchase_items")
      .insert({
        purchase_id: purchase.id,
        service_id: service.id,
        item_name: packageTier.name,
        duration_minutes: packageTier.durationMinutes,
        unit_price_cents: pricing.unitPriceCents,
        quantity: packageTier.sessions,
        quantity_remaining: packageTier.sessions - 1,
      })
      .select("id")
      .single();
    if (itemError) {
      await db
        .from("lesson_purchases")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", purchase.id);
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }
    purchaseItemId = String(itemRow.id);
  }

  const { error: sessionError } = await db.from("lesson_sessions").insert({
    purchase_id: purchase.id,
    purchase_item_id: purchaseItemId,
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

async function createCartCheckout(
  req: NextRequest,
  db: ReturnType<typeof supabaseAdmin>,
  items: Array<{ service: LessonServiceRow; quantity: number }>,
  customer: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    location: string;
    notes: string;
    signedInUserId: string | null;
  }
) {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const grossAmountCents = items.reduce(
    (sum, item) => sum + item.quantity * Number(item.service.price_cents ?? 0),
    0
  );
  const currency = items[0].service.currency ?? LESSON_CURRENCY;
  const description = items
    .map((item) => `${item.quantity}x ${item.service.name}`)
    .join(" + ")
    .slice(0, 255);

  const payfastMetadata: Record<string, unknown> = {
    cartItems: items.map((item) => ({ serviceId: item.service.id, quantity: item.quantity })),
  };
  if (customer.notes) payfastMetadata.clientNotes = customer.notes;

  const purchaseId = crypto.randomUUID();
  // This reference gates the public confirmation/status endpoints, so retain
  // the full UUID entropy rather than truncating it to eight hex characters.
  const reference = `STD-${purchaseId}`;
  const authorizationUrl = createPayFastCheckoutUrl({
    origin: getRequestOrigin(req),
    purchaseId,
    reference,
  });

  const { data: inserted, error: insertError } = await db
    .from("lesson_purchases")
    .insert({
      id: purchaseId,
      user_strava_id: null,
      created_by: customer.signedInUserId,
      kind: "cart",
      lesson_count: totalQuantity,
      unit_price_cents: Math.round(grossAmountCents / totalQuantity),
      discount_percent: 0,
      gross_amount_cents: grossAmountCents,
      discount_amount_cents: 0,
      total_amount_cents: grossAmountCents,
      currency,
      status: "pending_payment",
      description,
      customer_name: customer.customerName,
      customer_email: customer.customerEmail,
      customer_phone: customer.customerPhone || null,
      booking_location: customer.location || null,
      payfast_reference: reference,
      payfast_checkout_url: authorizationUrl,
      payfast_metadata: payfastMetadata,
      xero_sync_status: "not_configured",
    })
    .select("*")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const purchase = inserted as LessonPurchaseRow;

  const { error: itemsError } = await db.from("lesson_purchase_items").insert(
    items.map((item) => ({
      purchase_id: purchase.id,
      service_id: item.service.id,
      item_name: item.service.name,
      duration_minutes: Number(item.service.duration_minutes ?? 60),
      unit_price_cents: Number(item.service.price_cents ?? 0),
      quantity: item.quantity,
      quantity_remaining: item.quantity,
    }))
  );

  if (itemsError) {
    await db
      .from("lesson_purchases")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", purchase.id);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // One cart purchase produces one Xero invoice with one line per service.
  // Xero remains best-effort: record the failure for admin follow-up without
  // blocking the rider from reaching PayFast.
  if (isXeroConfigured()) {
    const { error: pendingXeroError } = await db
      .from("lesson_purchases")
      .update({ xero_sync_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", purchase.id);
    if (pendingXeroError) {
      return NextResponse.json({ error: pendingXeroError.message }, { status: 500 });
    }
    try {
      const invoice = await createXeroInvoiceForLessonPurchase({
        purchaseId: purchase.id,
        contactName: customer.customerName,
        contactEmail: customer.customerEmail,
        lessonCount: totalQuantity,
        unitPriceCents: Math.round(grossAmountCents / totalQuantity),
        discountPercent: 0,
        currency,
        description,
        lineItems: items.map((item) => ({
          description: item.service.name,
          quantity: item.quantity,
          unitPriceCents: Number(item.service.price_cents ?? 0),
        })),
      });
      if (invoice) {
        const { error: xeroUpdateError } = await db
          .from("lesson_purchases")
          .update({
            xero_invoice_id: invoice.invoiceId,
            xero_invoice_number: invoice.invoiceNumber,
            xero_invoice_url: invoice.invoiceUrl,
            xero_sync_status: "synced",
            xero_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id);
        if (xeroUpdateError) throw xeroUpdateError;
      }
    } catch (error) {
      await db
        .from("lesson_purchases")
        .update({
          xero_sync_status: "error",
          xero_error: (error instanceof Error ? error.message : "Xero invoice sync failed").slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    }
  }

  return NextResponse.json({ authorizationUrl, reference });
}
