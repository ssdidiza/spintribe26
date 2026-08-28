/**
 * Minimal RFC 5545 calendar invite builder. Produces a VEVENT that Google
 * Calendar, Apple Calendar, and Outlook all import — so a booking lands on the
 * coach's and student's calendars with reminders, with no Google OAuth project.
 */

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildGoogleCalendarUrl(input: {
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
}) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.summary,
    dates: `${formatIcsDate(input.startsAt)}/${formatIcsDate(input.endsAt)}`,
  });

  if (input.description) params.set("details", input.description);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildLessonIcs(input: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  method?: "REQUEST" | "PUBLISH" | "CANCEL";
}) {
  const method = input.method ?? "REQUEST";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SpinTribe//Lessons//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(input.startsAt)}`,
    `DTEND:${formatIcsDate(input.endsAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    input.description ? `DESCRIPTION:${escapeText(input.description)}` : "",
    input.location ? `LOCATION:${escapeText(input.location)}` : "",
    `ORGANIZER;CN=${escapeText(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(input.attendeeName)};RSVP=TRUE:mailto:${input.attendeeEmail}`,
    method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:SpinTribe session tomorrow",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:SpinTribe session in 2 hours",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}
