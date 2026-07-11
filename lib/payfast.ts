import { createHash, createHmac, timingSafeEqual } from "crypto";

type PayFastField = [name: string, value: string];

const PAYFAST_IP_RANGES = [
  ["197.97.145.144", 28],
  ["41.74.179.192", 27],
  ["102.216.36.0", 28],
  ["102.216.36.128", 28],
] as const;
const PAYFAST_SINGLE_IPS = new Set(["144.126.193.139"]);

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function payFastPassphrase() {
  return process.env.PAYFAST_PASSPHRASE?.trim() ?? "";
}

function checkoutSecret() {
  return (
    process.env.PAYFAST_CHECKOUT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    ""
  );
}

function isSandbox() {
  return process.env.PAYFAST_MODE?.trim().toLowerCase() === "sandbox";
}

export function isPayFastConfigured() {
  return Boolean(
    process.env.PAYFAST_MERCHANT_ID?.trim() &&
    process.env.PAYFAST_MERCHANT_KEY?.trim() &&
    payFastPassphrase() &&
    checkoutSecret()
  );
}

export function getPayFastProcessUrl() {
  return isSandbox()
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

function getPayFastValidationUrl() {
  return isSandbox()
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate";
}

function phpUrlEncode(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/[!'()*~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

export function buildPayFastParamString(fields: PayFastField[]) {
  return fields
    .filter(([name, value]) => name !== "signature" && value.trim() !== "")
    .map(([name, value]) => `${phpUrlEncode(name)}=${phpUrlEncode(value)}`)
    .join("&");
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

export function generatePayFastSignature(fields: PayFastField[]) {
  const paramString = buildPayFastParamString(fields);
  const passphrase = payFastPassphrase();
  return md5(passphrase ? `${paramString}&passphrase=${phpUrlEncode(passphrase)}` : paramString);
}

export function createPayFastPaymentFields(input: {
  reference: string;
  purchaseId: string;
  amountCents: number;
  itemName: string;
  itemDescription?: string | null;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  customerEmail?: string | null;
  customerName?: string | null;
}) {
  const nameParts = String(input.customerName ?? "").trim().split(/\s+/).filter(Boolean);
  const fields: PayFastField[] = [
    ["merchant_id", requiredEnv("PAYFAST_MERCHANT_ID")],
    ["merchant_key", requiredEnv("PAYFAST_MERCHANT_KEY")],
    ["return_url", input.returnUrl],
    ["cancel_url", input.cancelUrl],
    ["notify_url", input.notifyUrl],
    ["name_first", nameParts[0]?.slice(0, 100) ?? ""],
    ["name_last", nameParts.slice(1).join(" ").slice(0, 100)],
    ["email_address", String(input.customerEmail ?? "").slice(0, 100)],
    ["m_payment_id", input.reference.slice(0, 100)],
    ["amount", (input.amountCents / 100).toFixed(2)],
    ["item_name", input.itemName.slice(0, 100)],
    ["item_description", String(input.itemDescription ?? "").slice(0, 255)],
    ["custom_str1", input.purchaseId.slice(0, 255)],
  ];

  return [...fields, ["signature", generatePayFastSignature(fields)]] as PayFastField[];
}

function checkoutPayload(purchaseId: string, reference: string) {
  return `${purchaseId}:${reference}`;
}

export function createPayFastCheckoutToken(purchaseId: string, reference: string) {
  const secret = checkoutSecret();
  if (!secret) throw new Error("PAYFAST_CHECKOUT_SECRET or SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(checkoutPayload(purchaseId, reference)).digest("hex");
}

export function verifyPayFastCheckoutToken(purchaseId: string, reference: string, token: string | null) {
  if (!token || !/^[a-f0-9]{64}$/i.test(token) || !checkoutSecret()) return false;
  const expected = Buffer.from(createPayFastCheckoutToken(purchaseId, reference), "hex");
  const actual = Buffer.from(token, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createPayFastCheckoutUrl(input: {
  origin: string;
  purchaseId: string;
  reference: string;
}) {
  const url = new URL("/api/payfast/checkout", input.origin);
  url.searchParams.set("purchaseId", input.purchaseId);
  url.searchParams.set("token", createPayFastCheckoutToken(input.purchaseId, input.reference));
  return url.toString();
}

export function verifyPayFastItnSignature(params: URLSearchParams) {
  const received = params.get("signature")?.toLowerCase();
  if (!received || !/^[a-f0-9]{32}$/.test(received)) return false;

  const fields = Array.from(params.entries()).filter(([name]) => name !== "signature") as PayFastField[];
  const expected = Buffer.from(generatePayFastSignature(fields), "hex");
  const actual = Buffer.from(received, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function isInCidr(ip: string, network: string, prefix: number) {
  const ipNumber = ipv4ToNumber(ip);
  const networkNumber = ipv4ToNumber(network);
  if (ipNumber === null || networkNumber === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNumber & mask) === (networkNumber & mask);
}

export function isPayFastSourceIp(ip: string | null) {
  if (isSandbox() && process.env.NODE_ENV !== "production") return true;
  const normalized = String(ip ?? "").trim().replace(/^::ffff:/, "");
  return PAYFAST_SINGLE_IPS.has(normalized) || PAYFAST_IP_RANGES.some(
    ([network, prefix]) => isInCidr(normalized, network, prefix)
  );
}

export async function verifyPayFastServerConfirmation(params: URLSearchParams) {
  const fields = Array.from(params.entries()).filter(([name]) => name !== "signature") as PayFastField[];
  const response = await fetch(getPayFastValidationUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildPayFastParamString(fields),
    cache: "no-store",
  });
  return response.ok && (await response.text()).trim() === "VALID";
}
