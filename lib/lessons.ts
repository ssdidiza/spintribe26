export const LESSON_UNIT_PRICE_CENTS = 39900;
export const LESSON_CURRENCY = "ZAR";

export type LessonPurchaseStatus = "draft" | "pending_payment" | "paid" | "cancelled";
export type LessonSessionStatus = "pending_payment" | "booked" | "completed" | "cancelled" | "no_show" | "coach_cancelled";
export type LessonLedgerEventType =
  | "purchase_activated"
  | "booking_hold"
  | "booking_released"
  | "session_completed"
  | "late_cancel"
  | "no_show"
  | "adjustment";

export type LessonPurchaseRow = {
  id: string;
  user_strava_id: string | null;
  created_by: string | null;
  kind: "package" | "direct" | "cart";
  schedule_token: string | null;
  service_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  booking_starts_at: string | null;
  booking_duration_minutes: number | null;
  booking_location: string | null;
  lesson_count: number | string;
  unit_price_cents: number;
  discount_percent: number | string;
  gross_amount_cents: number;
  discount_amount_cents: number;
  total_amount_cents: number;
  currency: string;
  status: LessonPurchaseStatus;
  description: string | null;
  xero_invoice_id: string | null;
  xero_invoice_number: string | null;
  xero_invoice_url: string | null;
  xero_sync_status: string | null;
  xero_error: string | null;
  customer_email: string | null;
  payfast_reference: string | null;
  payfast_checkout_url: string | null;
  payfast_payment_id: string | null;
  payfast_paid_at: string | null;
  payfast_metadata: Record<string, unknown> | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonSessionRow = {
  id: string;
  purchase_id: string | null;
  purchase_item_id: string | null;
  user_strava_id: string | null;
  coach_strava_id: string | null;
  service_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  status: LessonSessionStatus;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  credit_amount: number | string;
  location: string | null;
  notes: string | null;
  client_notes: string | null;
  google_calendar_event_id: string | null;
  hold_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonPurchaseItemRow = {
  id: string;
  purchase_id: string;
  service_id: string | null;
  item_name: string;
  duration_minutes: number;
  unit_price_cents: number;
  quantity: number;
  quantity_remaining: number;
  created_at: string;
  updated_at: string;
};

export type LessonLedgerRow = {
  id: string;
  purchase_id: string | null;
  session_id: string | null;
  user_strava_id: string;
  event_type: LessonLedgerEventType;
  credit_delta: number | string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type LessonSummary = {
  paidCredits: number;
  pendingCredits: number;
  availableCredits: number;
  bookedCredits: number;
  completedCredits: number;
  forfeitedCredits: number;
  totalPaidCents: number;
  pendingAmountCents: number;
};

export function parseLessonCredits(value: unknown) {
  const credits = Number(value ?? 0);
  return Number.isFinite(credits) ? Math.round(credits * 100) / 100 : 0;
}

export function creditsForDuration(durationMinutes: number) {
  return Math.round((durationMinutes / 60) * 100) / 100;
}

export function formatCredits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatMoneyCents(cents: number, currency = LESSON_CURRENCY) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function calculateLessonPurchase(input: {
  lessonCount: number;
  unitPriceCents?: number;
  discountPercent?: number;
  currency?: string;
}) {
  const lessonCount = Math.max(0, Math.round(input.lessonCount * 100) / 100);
  const unitPriceCents = Math.max(0, Math.round(input.unitPriceCents ?? LESSON_UNIT_PRICE_CENTS));
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent ?? 0)));
  const grossAmountCents = Math.round(lessonCount * unitPriceCents);
  const discountAmountCents = Math.round(grossAmountCents * (discountPercent / 100));
  const totalAmountCents = Math.max(0, grossAmountCents - discountAmountCents);

  return {
    lessonCount,
    unitPriceCents,
    discountPercent,
    grossAmountCents,
    discountAmountCents,
    totalAmountCents,
    currency: input.currency ?? LESSON_CURRENCY,
  };
}

export function buildLessonSummary(
  purchases: LessonPurchaseRow[],
  sessions: LessonSessionRow[],
  ledger: LessonLedgerRow[]
): LessonSummary {
  const paidPurchases = purchases.filter((purchase) => purchase.status === "paid");
  const pendingPurchases = purchases.filter((purchase) => purchase.status === "pending_payment" || purchase.status === "draft");
  const ledgerBalance = ledger.reduce((sum, row) => sum + parseLessonCredits(row.credit_delta), 0);

  return {
    paidCredits: paidPurchases.reduce((sum, purchase) => sum + parseLessonCredits(purchase.lesson_count), 0),
    pendingCredits: pendingPurchases.reduce((sum, purchase) => sum + parseLessonCredits(purchase.lesson_count), 0),
    availableCredits: Math.max(0, Math.round(ledgerBalance * 100) / 100),
    bookedCredits: sessions
      .filter((session) => session.status === "booked")
      .reduce((sum, session) => sum + parseLessonCredits(session.credit_amount), 0),
    completedCredits: sessions
      .filter((session) => session.status === "completed")
      .reduce((sum, session) => sum + parseLessonCredits(session.credit_amount), 0),
    forfeitedCredits: sessions
      .filter((session) => session.status === "no_show")
      .reduce((sum, session) => sum + parseLessonCredits(session.credit_amount), 0),
    totalPaidCents: paidPurchases.reduce((sum, purchase) => sum + Number(purchase.total_amount_cents ?? 0), 0),
    pendingAmountCents: pendingPurchases.reduce((sum, purchase) => sum + Number(purchase.total_amount_cents ?? 0), 0),
  };
}

export function serializeLessonPurchase(row: LessonPurchaseRow) {
  return {
    id: row.id,
    userId: row.user_strava_id ? String(row.user_strava_id) : null,
    kind: row.kind ?? "package",
    scheduleToken: row.schedule_token ?? null,
    serviceId: row.service_id ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    bookingStartsAt: row.booking_starts_at ?? null,
    bookingDurationMinutes: row.booking_duration_minutes ?? null,
    bookingLocation: row.booking_location ?? null,
    lessonCount: parseLessonCredits(row.lesson_count),
    unitPriceCents: Number(row.unit_price_cents ?? 0),
    discountPercent: Number(row.discount_percent ?? 0),
    grossAmountCents: Number(row.gross_amount_cents ?? 0),
    discountAmountCents: Number(row.discount_amount_cents ?? 0),
    totalAmountCents: Number(row.total_amount_cents ?? 0),
    currency: row.currency ?? LESSON_CURRENCY,
    status: row.status,
    description: row.description,
    xeroInvoiceId: row.xero_invoice_id,
    xeroInvoiceNumber: row.xero_invoice_number,
    xeroInvoiceUrl: row.xero_invoice_url,
    xeroSyncStatus: row.xero_sync_status,
    xeroError: row.xero_error,
    customerEmail: row.customer_email,
    payfastReference: row.payfast_reference,
    payfastCheckoutUrl: row.payfast_checkout_url,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeLessonPurchaseItem(row: LessonPurchaseItemRow) {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    serviceId: row.service_id,
    name: row.item_name,
    durationMinutes: Number(row.duration_minutes ?? 60),
    unitPriceCents: Number(row.unit_price_cents ?? 0),
    quantity: Number(row.quantity ?? 0),
    quantityRemaining: Number(row.quantity_remaining ?? 0),
  };
}

export function serializeLessonSession(row: LessonSessionRow) {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    userId: row.user_strava_id ? String(row.user_strava_id) : null,
    coachId: row.coach_strava_id,
    serviceId: row.service_id ?? null,
    customerName: row.customer_name ?? null,
    customerEmail: row.customer_email ?? null,
    customerPhone: row.customer_phone ?? null,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: Number(row.duration_minutes ?? 0),
    creditAmount: parseLessonCredits(row.credit_amount),
    location: row.location,
    notes: row.notes,
    clientNotes: row.client_notes,
    googleCalendarEventId: row.google_calendar_event_id,
    holdExpiresAt: row.hold_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
