export type EmailAttachment = {
  filename: string;
  content: string;
};

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function resendFrom() {
  return process.env.RESEND_FROM?.trim() || "SpinTribe <onboarding@resend.dev>";
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false as const, reason: "email_not_configured" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const result = (await response.json().catch(() => ({}))) as { id?: string };
  return { sent: true as const, messageId: result.id ?? null };
}
