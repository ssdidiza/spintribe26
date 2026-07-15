import { LESSON_CURRENCY } from "@/lib/lessons";
import { supabaseAdmin } from "@/lib/supabase";

type XeroTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type XeroConnection = {
  tenantId?: string;
  tenantName?: string;
  tenantType?: string;
};

type XeroInvoiceResponse = {
  Invoices?: {
    InvoiceID?: string;
    InvoiceNumber?: string;
    Url?: string;
  }[];
};

type StoredXeroCredential = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  tenant_id: string | null;
};

function getXeroTenantId() {
  return process.env.XERO_TENANT_ID?.trim() ?? "";
}

function getXeroClientCredentials() {
  const clientId = process.env.XERO_CLIENT_ID?.trim();
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("XERO_CLIENT_ID and XERO_CLIENT_SECRET are not configured");
  }
  return { clientId, clientSecret };
}

function getXeroAccountCode() {
  return process.env.XERO_LESSON_ACCOUNT_CODE?.trim() ?? process.env.XERO_REVENUE_ACCOUNT_CODE?.trim() ?? "";
}

export function isXeroConfigured() {
  const staticToken = process.env.XERO_ACCESS_TOKEN?.trim();
  const oauthConfig = process.env.XERO_CLIENT_ID?.trim() && process.env.XERO_CLIENT_SECRET?.trim();

  return Boolean((staticToken && getXeroTenantId()) || oauthConfig);
}

function formatXeroDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function getXeroAccessToken() {
  const db = supabaseAdmin();
  const { data: stored, error: storedError } = await db
    .from("integration_credentials")
    .select("access_token,refresh_token,expires_at,tenant_id")
    .eq("provider", "xero")
    .maybeSingle();
  if (storedError) throw new Error(`Unable to read stored Xero credentials: ${storedError.message}`);

  const credential = stored as StoredXeroCredential | null;
  const storedExpiresAt = credential?.expires_at ? new Date(credential.expires_at).getTime() : 0;
  if (credential?.access_token && storedExpiresAt > Date.now() + 60_000) {
    return credential.access_token;
  }

  const staticToken = process.env.XERO_ACCESS_TOKEN?.trim();
  const clientId = process.env.XERO_CLIENT_ID?.trim();
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
  const refreshToken = credential?.refresh_token || process.env.XERO_REFRESH_TOKEN?.trim();
  if ((!clientId || !clientSecret || !refreshToken) && staticToken) return staticToken;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Xero OAuth environment variables are not configured");
  }

  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const json = (await response.json().catch(() => null)) as XeroTokenResponse | null;
  if (!response.ok || !json?.access_token) {
    throw new Error("Unable to refresh Xero access token");
  }

  const expiresAt = new Date(Date.now() + Math.max(60, Number(json.expires_in ?? 1800)) * 1000).toISOString();
  const { error: storeError } = await db
    .from("integration_credentials")
    .upsert({
      provider: "xero",
      access_token: json.access_token,
      refresh_token: json.refresh_token || refreshToken,
      expires_at: expiresAt,
      tenant_id: credential?.tenant_id || getXeroTenantId() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });

  if (storeError) throw new Error(`Unable to store rotated Xero token: ${storeError.message}`);
  return json.access_token;
}

export function getXeroRedirectUri(origin: string) {
  const configured = process.env.XERO_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${origin.replace(/\/$/, "")}/api/xero/callback`;
}

export function getXeroAuthorizationUrl(input: { origin: string; state: string }) {
  const { clientId } = getXeroClientCredentials();
  const url = new URL("https://login.xero.com/identity/connect/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getXeroRedirectUri(input.origin));
  url.searchParams.set("scope", "openid profile email offline_access accounting.invoices accounting.payments");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function connectXeroFromAuthorizationCode(input: {
  code: string;
  origin: string;
}) {
  const { clientId, clientSecret } = getXeroClientCredentials();
  const redirectUri = getXeroRedirectUri(input.origin);
  const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  const tokens = (await tokenResponse.json().catch(() => null)) as XeroTokenResponse | null;
  if (!tokenResponse.ok || !tokens?.access_token || !tokens.refresh_token) {
    throw new Error("Xero did not return valid OAuth tokens");
  }

  const connectionsResponse = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const connections = (await connectionsResponse.json().catch(() => null)) as XeroConnection[] | null;
  if (!connectionsResponse.ok || !Array.isArray(connections) || connections.length === 0) {
    throw new Error("No Xero organisation was connected");
  }

  const configuredTenantId = getXeroTenantId();
  const connection = configuredTenantId
    ? connections.find((item) => item.tenantId === configuredTenantId)
    : connections[0];
  if (!connection?.tenantId) {
    throw new Error("The configured Xero tenant was not authorised");
  }

  const expiresAt = new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 1800)) * 1000).toISOString();
  const db = supabaseAdmin();
  const { error } = await db.from("integration_credentials").upsert({
    provider: "xero",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    tenant_id: connection.tenantId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider" });
  if (error) throw new Error(`Unable to store Xero credentials: ${error.message}`);

  return {
    tenantId: connection.tenantId,
    tenantName: connection.tenantName ?? "Xero organisation",
    tenantType: connection.tenantType ?? null,
  };
}

async function xeroFetch(path: string, init: RequestInit) {
  const accessToken = await getXeroAccessToken();
  const db = supabaseAdmin();
  const { data: stored, error: storedError } = await db
    .from("integration_credentials")
    .select("tenant_id")
    .eq("provider", "xero")
    .maybeSingle();
  if (storedError) throw new Error(`Unable to read the Xero tenant: ${storedError.message}`);
  const tenantId = String(stored?.tenant_id || getXeroTenantId()).trim();
  if (!tenantId) throw new Error("Xero is not connected to an organisation");

  const response = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof json === "object" && json && "Message" in json
      ? String(json.Message)
      : `Xero request failed with status ${response.status}`;
    throw new Error(message);
  }

  return json;
}

export async function createXeroInvoiceForLessonPurchase(input: {
  purchaseId: string;
  contactName: string;
  contactEmail?: string;
  lessonCount: number;
  unitPriceCents: number;
  discountPercent: number;
  currency?: string;
  description?: string;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    discountPercent?: number;
  }>;
}) {
  if (!isXeroConfigured()) return null;

  const accountCode = getXeroAccountCode();
  if (!accountCode) throw new Error("XERO_LESSON_ACCOUNT_CODE is not configured");

  const taxType = process.env.XERO_LESSON_TAX_TYPE?.trim();
  const invoiceStatus = process.env.XERO_INVOICE_STATUS?.trim() || "AUTHORISED";
  const requestedLineItems = input.lineItems?.length
    ? input.lineItems
    : [{
        description: input.description || "Cycling lesson",
        quantity: input.lessonCount,
        unitPriceCents: input.unitPriceCents,
        discountPercent: input.discountPercent,
      }];
  const lineItems = requestedLineItems.map((item) => {
    const lineItem: Record<string, unknown> = {
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unitPriceCents / 100,
      DiscountRate: item.discountPercent ?? 0,
      AccountCode: accountCode,
    };
    if (taxType) lineItem.TaxType = taxType;
    return lineItem;
  });

  const payload = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: {
          Name: input.contactName,
          ...(input.contactEmail ? { EmailAddress: input.contactEmail } : {}),
        },
        Date: formatXeroDate(),
        DueDate: formatXeroDate(),
        LineAmountTypes: "Exclusive",
        CurrencyCode: input.currency ?? LESSON_CURRENCY,
        Reference: `SpinTribe lessons ${input.purchaseId}`,
        Status: invoiceStatus,
        LineItems: lineItems,
      },
    ],
  };

  const json = (await xeroFetch("/Invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as XeroInvoiceResponse;

  const invoice = json.Invoices?.[0];
  return {
    invoiceId: invoice?.InvoiceID ?? null,
    invoiceNumber: invoice?.InvoiceNumber ?? null,
    invoiceUrl: invoice?.Url ?? null,
  };
}

export async function recordXeroPaymentForLessonPurchase(input: {
  invoiceId: string;
  amountCents: number;
  reference: string;
  paidAt?: string | null;
}) {
  if (!isXeroConfigured()) return null;

  const accountCode = process.env.XERO_PAYFAST_ACCOUNT_CODE?.trim() ?? process.env.XERO_BANK_ACCOUNT_CODE?.trim();
  if (!accountCode) return null;

  return xeroFetch("/Payments", {
    method: "POST",
    body: JSON.stringify({
      Payments: [
        {
          Invoice: { InvoiceID: input.invoiceId },
          Account: { Code: accountCode },
          Date: formatXeroDate(input.paidAt ? new Date(input.paidAt) : new Date()),
          Amount: input.amountCents / 100,
          Reference: input.reference,
        },
      ],
    }),
  });
}
