import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { data: requests, error } = await ctx.db
    .from("tier_upgrade_requests")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = [...new Set((requests ?? []).map((request) => String(request.user_strava_id)))];
  const { data: users } = userIds.length
    ? await ctx.db.from("users").select("strava_id,name,avatar,role,tier").in("strava_id", userIds)
    : { data: [] };
  const userById = new Map((users ?? []).map((user) => [String(user.strava_id), user]));

  return NextResponse.json({
    requests: (requests ?? []).map((request) => {
      const user = userById.get(String(request.user_strava_id));
      return {
        id: String(request.id),
        userId: String(request.user_strava_id),
        userName: user?.name ?? "Unknown rider",
        avatar: user?.avatar ?? "",
        currentTier: Number(request.current_tier),
        requestedTier: Number(request.requested_tier),
        monthKey: request.month_key,
        monthlyKm: Number(request.monthly_km),
        status: request.status,
        requestedAt: request.requested_at,
        decidedAt: request.decided_at,
        decidedBy: request.decided_by,
        effectiveOn: request.effective_on,
        appliedAt: request.applied_at,
        adminNote: request.admin_note ?? "",
      };
    }),
  });
}
