import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import {
  buildLessonSummary,
  LessonLedgerRow,
  LessonPurchaseRow,
  LessonSessionRow,
  serializeLessonPurchase,
  serializeLessonSession,
} from "@/lib/lessons";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const [purchasesResult, sessionsResult, ledgerResult] = await Promise.all([
    ctx.db.from("lesson_purchases").select("*").order("created_at", { ascending: false }),
    ctx.db.from("lesson_sessions").select("*").order("starts_at", { ascending: true }),
    ctx.db.from("lesson_credit_ledger").select("*").order("created_at", { ascending: false }),
  ]);

  if (purchasesResult.error) return NextResponse.json({ error: purchasesResult.error.message }, { status: 500 });
  if (sessionsResult.error) return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 });
  if (ledgerResult.error) return NextResponse.json({ error: ledgerResult.error.message }, { status: 500 });

  const purchases = (purchasesResult.data ?? []) as LessonPurchaseRow[];
  const sessions = (sessionsResult.data ?? []) as LessonSessionRow[];
  const ledger = (ledgerResult.data ?? []) as LessonLedgerRow[];
  const userIds = Array.from(new Set([
    ...purchases.map((purchase) => String(purchase.user_strava_id ?? "")),
    ...sessions.map((lessonSession) => String(lessonSession.user_strava_id ?? "")),
    ...ledger.map((row) => String(row.user_strava_id ?? "")),
  ].filter(Boolean)));

  const usersResult = userIds.length
    ? await ctx.db
        .from("users")
        .select("strava_id,name,avatar")
        .in("strava_id", userIds)
    : { data: [], error: null };

  if (usersResult.error) return NextResponse.json({ error: usersResult.error.message }, { status: 500 });

  const userById = new Map((usersResult.data ?? []).map((user) => [
    String(user.strava_id),
    { id: String(user.strava_id), name: String(user.name ?? "Rider"), avatar: user.avatar as string | null },
  ]));

  const summariesByUser = userIds.map((userId) => {
    const rider = userById.get(userId) ?? { id: userId, name: "Rider", avatar: null };
    return {
      rider,
      summary: buildLessonSummary(
        purchases.filter((purchase) => String(purchase.user_strava_id) === userId),
        sessions.filter((lessonSession) => String(lessonSession.user_strava_id) === userId),
        ledger.filter((row) => String(row.user_strava_id) === userId)
      ),
    };
  });

  const aggregate = summariesByUser.reduce(
    (sum, row) => ({
      paidCredits: sum.paidCredits + row.summary.paidCredits,
      availableCredits: sum.availableCredits + row.summary.availableCredits,
      bookedCredits: sum.bookedCredits + row.summary.bookedCredits,
      completedCredits: sum.completedCredits + row.summary.completedCredits,
      forfeitedCredits: sum.forfeitedCredits + row.summary.forfeitedCredits,
      totalPaidCents: sum.totalPaidCents + row.summary.totalPaidCents,
      pendingAmountCents: sum.pendingAmountCents + row.summary.pendingAmountCents,
      pendingCredits: sum.pendingCredits + row.summary.pendingCredits,
    }),
    {
      paidCredits: 0,
      availableCredits: 0,
      bookedCredits: 0,
      completedCredits: 0,
      forfeitedCredits: 0,
      totalPaidCents: 0,
      pendingAmountCents: 0,
      pendingCredits: 0,
    }
  );

  // Per-rider summaries cover members only; fold guest/direct revenue back in so
  // the headline totals reflect every paid lesson, not just members'.
  const directPurchases = purchases.filter((purchase) => purchase.kind === "direct");
  const directPaidCents = directPurchases
    .filter((purchase) => purchase.status === "paid")
    .reduce((sum, purchase) => sum + Number(purchase.total_amount_cents ?? 0), 0);
  const directBookings = sessions.filter((lessonSession) => !lessonSession.user_strava_id).length;

  return NextResponse.json({
    summary: {
      ...aggregate,
      totalPaidCents: aggregate.totalPaidCents + directPaidCents,
      directPaidCents,
      directBookings,
      pendingPayments: purchases.filter((purchase) => purchase.status === "pending_payment" || purchase.status === "draft").length,
      xeroErrors: purchases.filter((purchase) => purchase.xero_sync_status === "error").length,
    },
    riders: summariesByUser.sort((a, b) =>
      b.summary.availableCredits - a.summary.availableCredits ||
      b.summary.bookedCredits - a.summary.bookedCredits ||
      a.rider.name.localeCompare(b.rider.name)
    ),
    purchases: purchases.map((purchase) => ({
      ...serializeLessonPurchase(purchase),
      rider: userById.get(String(purchase.user_strava_id ?? "")) ?? {
        id: String(purchase.user_strava_id ?? purchase.id),
        name: purchase.customer_name || "Guest",
        avatar: null,
      },
    })),
    sessions: sessions.map((lessonSession) => ({
      ...serializeLessonSession(lessonSession),
      rider: userById.get(String(lessonSession.user_strava_id ?? "")) ?? {
        id: String(lessonSession.user_strava_id ?? lessonSession.id),
        name: lessonSession.customer_name || "Guest",
        avatar: null,
      },
    })),
  });
}
