import { buildGoogleCalendarUrl } from "@/lib/ics";

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

function parseIcsDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unescapeIcsText(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function icsValue(ics: string, key: string) {
  const line = ics.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
  return line ? unescapeIcsText(line.slice(key.length + 1)) : "";
}

function googleCalendarLinkFromAttachments(attachments?: EmailAttachment[]) {
  const invite = attachments?.find((attachment) => attachment.filename.toLowerCase().endsWith(".ics"));
  if (!invite) return "";

  try {
    const ics = Buffer.from(invite.content, "base64").toString("utf-8");
    if (/^METHOD:CANCEL$/m.test(ics)) return "";

    const startsAt = parseIcsDate(icsValue(ics, "DTSTART"));
    const endsAt = parseIcsDate(icsValue(ics, "DTEND"));
    const summary = icsValue(ics, "SUMMARY");
    if (!startsAt || !endsAt || !summary) return "";

    return buildGoogleCalendarUrl({
      startsAt,
      endsAt,
      summary,
      description: icsValue(ics, "DESCRIPTION") || undefined,
      location: icsValue(ics, "LOCATION") || undefined,
    });
  } catch {
    return "";
  }
}

function withCalendarLink(html: string, attachments?: EmailAttachment[]) {
  const calendarUrl = googleCalendarLinkFromAttachments(attachments);
  if (!calendarUrl) return html;
  const safeUrl = calendarUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `${html}\n<p><a href="${safeUrl}" style="display:inline-block;background:#ff4b35;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Add to Google Calendar</a></p>`;
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
      html: withCalendarLink(input.html, input.attachments),
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
