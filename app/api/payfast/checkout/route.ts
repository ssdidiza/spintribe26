import { NextRequest, NextResponse } from "next/server";
import { LessonPurchaseRow } from "@/lib/lessons";
import {
  createPayFastPaymentFields,
  getPayFastProcessUrl,
  isPayFastConfigured,
  verifyPayFastCheckoutToken,
} from "@/lib/payfast";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appOrigin(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  if (!isPayFastConfigured()) {
    return NextResponse.json({ error: "PayFast is not configured" }, { status: 503 });
  }

  const purchaseId = req.nextUrl.searchParams.get("purchaseId")?.trim();
  const token = req.nextUrl.searchParams.get("token");
  if (!purchaseId) return NextResponse.json({ error: "purchaseId is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("lesson_purchases").select("*").eq("id", purchaseId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lesson purchase not found" }, { status: 404 });

  const purchase = data as LessonPurchaseRow;
  const reference = purchase.payfast_reference ?? "";
  if (!verifyPayFastCheckoutToken(purchase.id, reference, token)) {
    return NextResponse.json({ error: "Invalid payment link" }, { status: 403 });
  }
  const isDirect = purchase.kind === "direct";
  if (purchase.status === "paid") {
    const paidUrl = isDirect
      ? `/book/confirmed?reference=${encodeURIComponent(reference)}`
      : "/lessons?payment=already_paid";
    return NextResponse.redirect(new URL(paidUrl, appOrigin(req)));
  }
  if (purchase.status !== "pending_payment") {
    return NextResponse.json({ error: "This payment link is no longer active" }, { status: 409 });
  }
  if (isDirect) {
    const { data: heldSession, error: heldSessionError } = await db
      .from("lesson_sessions")
      .select("id,status,hold_expires_at")
      .eq("purchase_id", purchase.id)
      .limit(1)
      .maybeSingle();
    if (heldSessionError) return NextResponse.json({ error: heldSessionError.message }, { status: 500 });
    if (!heldSession || heldSession.status !== "pending_payment") {
      return NextResponse.json({ error: "This booking hold is no longer active" }, { status: 409 });
    }
    if (heldSession.hold_expires_at && new Date(heldSession.hold_expires_at).getTime() <= Date.now()) {
      const updatedAt = new Date().toISOString();
      await Promise.all([
        db.from("lesson_sessions").update({ status: "cancelled", updated_at: updatedAt }).eq("id", heldSession.id),
        db.from("lesson_purchases").update({ status: "cancelled", updated_at: updatedAt }).eq("id", purchase.id),
      ]);
      return NextResponse.json({ error: "This booking hold expired. Please choose the slot again." }, { status: 409 });
    }
  }
  let customerName = purchase.customer_name ?? null;
  if (!customerName && purchase.user_strava_id) {
    const { data: rider } = await db
      .from("users")
      .select("name")
      .eq("strava_id", String(purchase.user_strava_id))
      .maybeSingle();
    customerName = rider?.name ?? null;
  }

  const origin = appOrigin(req);
  const itemName = isDirect
    ? (purchase.description || "SpinTribe cycling lesson").slice(0, 100)
    : `${Number(purchase.lesson_count)} SpinTribe cycling lessons`;
  // Guests have no login, so direct bookings return to the public confirmation page.
  const returnUrl = isDirect
    ? `${origin}/book/confirmed?reference=${encodeURIComponent(reference)}`
    : `${origin}/lessons?reference=${encodeURIComponent(reference)}`;
  const cancelUrl = isDirect ? `${origin}/book?payment=cancelled` : `${origin}/lessons?payment=cancelled`;

  const fields = createPayFastPaymentFields({
    reference,
    purchaseId: purchase.id,
    amountCents: purchase.total_amount_cents,
    itemName,
    itemDescription: purchase.xero_invoice_number
      ? `SpinTribe cycling lessons - ${purchase.xero_invoice_number}`
      : purchase.description,
    returnUrl,
    cancelUrl,
    notifyUrl: `${origin}/api/payfast/notify`,
    customerEmail: purchase.customer_email,
    customerName,
  });
  const inputs = fields.map(([name, value]) =>
    `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
  ).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Continue to PayFast</title></head>
<body><main><p>Opening secure payment...</p><form id="payfast" method="post" action="${escapeHtml(getPayFastProcessUrl())}">${inputs}<button type="submit">Continue to PayFast</button></form></main>
<script>document.getElementById("payfast").submit()</script></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action https://www.payfast.co.za https://sandbox.payfast.co.za; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
