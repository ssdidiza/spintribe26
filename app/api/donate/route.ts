import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MIN_AMOUNT = 5;
const MAX_AMOUNT = 10000;
const DEFAULT_AMOUNT = 50;

/**
 * GET /api/donate?amount=50 — redirect to a PayFast "Pay Now" page for the
 * given rand amount. PayFast requires `amount` on `_paynow` links (omitting it
 * returns a 400 "The amount field is required"), so the amount is chosen in
 * our UI and passed here. Reuses the existing PayFast merchant account;
 * nothing is stored on our side and no signature is required for
 * receiver-style PayNow links.
 *
 * Kill criteria: remove if donations are effectively zero after 3 months.
 */
export async function GET(req: NextRequest) {
  const receiver = process.env.PAYFAST_MERCHANT_ID?.trim();
  if (!receiver) return NextResponse.redirect(new URL("/", req.nextUrl.origin));

  const parsed = Number.parseFloat(req.nextUrl.searchParams.get("amount") ?? "");
  const amount = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, MIN_AMOUNT), MAX_AMOUNT)
    : DEFAULT_AMOUNT;

  const sandbox = process.env.PAYFAST_MODE?.trim().toLowerCase() === "sandbox";
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    req.nextUrl.origin
  ).replace(/\/$/, "");

  const url = new URL(
    sandbox ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process"
  );
  url.searchParams.set("cmd", "_paynow");
  url.searchParams.set("receiver", receiver);
  url.searchParams.set("amount", amount.toFixed(2));
  url.searchParams.set("item_name", "Support SpinTribe");
  url.searchParams.set("item_description", "Donation to keep SpinTribe rolling");
  url.searchParams.set("return_url", `${origin}/races`);
  url.searchParams.set("cancel_url", `${origin}/races`);

  return NextResponse.redirect(url.toString());
}
