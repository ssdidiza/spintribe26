import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/donate — redirect to a PayFast "Pay Now" page where the supporter
 * types in their own amount (omitting `amount` on a PayNow link lets the payer
 * choose). Reuses the existing PayFast merchant account; nothing is stored on
 * our side and no signature is required for receiver-style PayNow links.
 *
 * Kill criteria: remove if donations are effectively zero after 3 months.
 */
export async function GET(req: NextRequest) {
  const receiver = process.env.PAYFAST_MERCHANT_ID?.trim();
  if (!receiver) return NextResponse.redirect(new URL("/", req.nextUrl.origin));

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
  url.searchParams.set("item_name", "Support SpinTribe");
  url.searchParams.set("item_description", "Donation to keep SpinTribe rolling");
  url.searchParams.set("return_url", `${origin}/races`);
  url.searchParams.set("cancel_url", `${origin}/races`);

  return NextResponse.redirect(url.toString());
}
