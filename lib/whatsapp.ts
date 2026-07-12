/**
 * WhatsApp Cloud API (Meta Graph API) client — plain fetch, no SDK, same
 * best-effort style as the Resend integration in lib/notify.ts. Lights up
 * the moment WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set.
 *
 * Business-initiated messages outside a 24-hour customer-service window
 * MUST use a pre-approved template, so production runs in template mode
 * (WHATSAPP_SEND_MODE=template, the default). Text mode exists for testing
 * against a number that recently messaged the business.
 */

function accessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
}

function phoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
}

function apiVersion() {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v25.0";
}

export function whatsAppSendMode(): "template" | "text" {
  return process.env.WHATSAPP_SEND_MODE?.trim() === "text" ? "text" : "template";
}

export function whatsAppTemplateLanguage() {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en";
}

export function isWhatsAppConfigured() {
  return Boolean(accessToken() && phoneNumberId());
}

/**
 * Normalise a rider-typed number to Cloud API format (E.164 digits, no +).
 * Local South African numbers (0XX XXX XXXX) become 27XXXXXXXXX; anything
 * already carrying a country code passes through.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("0")) return `27${digits.slice(1)}`;
  // "+27 (0)71 234 5678" — country code plus redundant trunk zero.
  if (digits.length === 12 && digits.startsWith("270")) return `27${digits.slice(3)}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

type WhatsAppSendResult = { messageId: string };

async function postWhatsAppMessage(message: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion()}/${phoneNumberId()}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...message }),
      cache: "no-store",
    }
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp Cloud API responded ${response.status}: ${body.slice(0, 300)}`);
  }
  const parsed = JSON.parse(body) as { messages?: Array<{ id?: string }> };
  return { messageId: parsed.messages?.[0]?.id ?? "" };
}

export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  bodyParams: string[];
}): Promise<WhatsAppSendResult> {
  return postWhatsAppMessage({
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: whatsAppTemplateLanguage() },
      components: [
        {
          type: "body",
          parameters: input.bodyParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  });
}

export async function sendWhatsAppText(input: { to: string; text: string }): Promise<WhatsAppSendResult> {
  return postWhatsAppMessage({
    to: input.to,
    type: "text",
    text: { body: input.text },
  });
}
