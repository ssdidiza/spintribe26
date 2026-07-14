import { NextRequest, NextResponse } from "next/server";
import {
  LessonPurchaseItemRow,
  LessonPurchaseRow,
  LessonSessionRow,
  serializeLessonPurchaseItem,
} from "@/lib/lessons";
import { LessonServiceRow } from "@/lib/lesson-services";
import {
  getLessonAvailability,
  isSlotConstraintError,
  johannesburgDateKey,
} from "@/lib/lesson-availability";
import { dispatchLessonBookingNotifications } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Public, token-gated: the schedule_token on a paid purchase is the only
// credential — it's unguessable, delivered by email/WhatsApp after payment,
// and scoped to that purchase's session balances. No account needed.

function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24,64}$/i.test(value);
}

async function loadPurchaseByToken(db: ReturnType<typeof supabaseAdmin>, token: string) {
  const { data, error } = await db
    .from("lesson_purchases")
    .select("*")
    .eq("schedule_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as LessonPurchaseRow | null) ?? null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!isToken(token)) return NextResponse.json({ error: "Invalid schedule link" }, { status: 400 });

  const db = supabaseAdmin();
  let purchase: LessonPurchaseRow | null;
  try {
    purchase = await loadPurchaseByToken(db, token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load" }, { status: 500 });
  }
  if (!purchase) return NextResponse.json({ error: "Schedule link not found" }, { status: 404 });

  const [itemsResult, sessionsResult] = await Promise.all([
    db
      .from("lesson_purchase_items")
      .select("*")
      .eq("purchase_id", purchase.id)
      .order("created_at", { ascending: true }),
    db
      .from("lesson_sessions")
      .select("id,status,starts_at,ends_at,duration_minutes,location,purchase_item_id,service_id")
      .eq("purchase_id", purchase.id)
      .order("starts_at", { ascending: true }),
  ]);
  if (itemsResult.error) return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
  if (sessionsResult.error) return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 });

  const items = (itemsResult.data ?? []) as LessonPurchaseItemRow[];
  const itemNameById = new Map(items.map((item) => [item.id, item.item_name]));

  return NextResponse.json({
    paid: purchase.status === "paid",
    status: purchase.status,
    customerName: purchase.customer_name ?? "",
    description: purchase.description ?? "",
    location: purchase.booking_location ?? "",
    items: items.map(serializeLessonPurchaseItem),
    sessions: ((sessionsResult.data ?? []) as Pick<
      LessonSessionRow,
      "id" | "status" | "starts_at" | "ends_at" | "duration_minutes" | "location" | "purchase_item_id" | "service_id"
    >[]).map((session) => ({
      id: session.id,
      status: session.status,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      durationMinutes: Number(session.duration_minutes ?? 60),
      location: session.location ?? "",
      itemName: (session.purchase_item_id && itemNameById.get(session.purchase_item_id)) || null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const itemId = String(body.itemId ?? "").trim();
  const startsAtValue = String(body.startsAt ?? "");
  const location = String(body.location ?? "").trim().slice(0, 160);
  const notes = String(body.notes ?? "").trim().slice(0, 500);

  if (!isToken(token)) return NextResponse.json({ error: "Invalid schedule link" }, { status: 400 });
  if (!itemId) return NextResponse.json({ error: "Please choose a session type" }, { status: 400 });
  const startsAt = new Date(startsAtValue);
  if (!Number.isFinite(startsAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid date and time" }, { status: 400 });
  }

  const db = supabaseAdmin();
  let purchase: LessonPurchaseRow | null;
  try {
    purchase = await loadPurchaseByToken(db, token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load" }, { status: 500 });
  }
  if (!purchase) return NextResponse.json({ error: "Schedule link not found" }, { status: 404 });
  if (purchase.status !== "paid") {
    return NextResponse.json({ error: "This purchase hasn't been paid yet" }, { status: 409 });
  }

  const { data: itemData, error: itemError } = await db
    .from("lesson_purchase_items")
    .select("*")
    .eq("id", itemId)
    .eq("purchase_id", purchase.id)
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  if (!itemData) return NextResponse.json({ error: "That session type isn't on this purchase" }, { status: 404 });

  const item = itemData as LessonPurchaseItemRow;
  if (Number(item.quantity_remaining) <= 0) {
    return NextResponse.json({ error: "No sessions left on this item" }, { status: 409 });
  }

  // Same slot validation as /book: the item's snapshotted duration wins.
  const { data: serviceData } = item.service_id
    ? await db.from("lesson_services").select("*").eq("id", item.service_id).maybeSingle()
    : { data: null };
  const schedulingService = {
    ...((serviceData as LessonServiceRow | null) ?? {
      id: item.service_id ?? item.id,
      slug: "package-item",
      name: item.item_name,
      description: "",
      price_cents: item.unit_price_cents,
      currency: purchase.currency,
      active: true,
      sort_order: 0,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }),
    duration_minutes: item.duration_minutes,
  } as LessonServiceRow;

  const requestedDate = johannesburgDateKey(startsAt);
  const [day] = await getLessonAvailability(db, schedulingService, { fromDate: requestedDate, days: 1 });
  const isAvailable = day?.slots.some((slot) => new Date(slot).getTime() === startsAt.getTime());
  if (!isAvailable) {
    return NextResponse.json({ error: "That time was just taken. Please pick another slot." }, { status: 409 });
  }

  // Atomic: decrements the balance and inserts the session in one transaction;
  // the exclusion constraint rejects overlapping slots and rolls both back.
  // .single() forces the row-typed RPC result to come back as one object.
  const { data: sessionData, error: bookError } = await db
    .rpc("book_package_session", {
      p_item_id: item.id,
      p_starts_at: startsAt.toISOString(),
      p_location: location || null,
      p_client_notes: notes || null,
    })
    .single();

  if (bookError) {
    if (isSlotConstraintError(bookError)) {
      return NextResponse.json({ error: "That time was just taken. Please pick another slot." }, { status: 409 });
    }
    if (bookError.message?.includes("no sessions remaining")) {
      return NextResponse.json({ error: "No sessions left on this item" }, { status: 409 });
    }
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }

  const session = sessionData as LessonSessionRow;

  // Same confirmations as a paid direct booking: coach notification, .ics
  // emails, instant WhatsApp. Best-effort — the session is already booked.
  await dispatchLessonBookingNotifications(db, {
    sessionId: session.id,
    serviceName: item.item_name,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    durationMinutes: Number(session.duration_minutes ?? item.duration_minutes),
    location: session.location,
    notes: session.client_notes,
    customerName: purchase.customer_name || "Guest rider",
    customerEmail: purchase.customer_email,
    customerPhone: purchase.customer_phone,
    scheduleUrl: (() => {
      const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "").replace(/\/$/, "");
      return origin && purchase.schedule_token
        ? `${origin}/schedule?token=${encodeURIComponent(purchase.schedule_token)}`
        : null;
    })(),
    remainingSessions: Math.max(0, Number(item.quantity_remaining) - 1),
  }).catch(() => undefined);

  return NextResponse.json({
    session: {
      id: session.id,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      durationMinutes: Number(session.duration_minutes ?? 60),
      location: session.location ?? "",
    },
    remaining: Math.max(0, Number(item.quantity_remaining) - 1),
  });
}
