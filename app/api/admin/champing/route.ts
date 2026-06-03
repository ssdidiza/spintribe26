import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { data: sessions, error } = await ctx.db
    .from("champion_sessions")
    .select("id,user_strava_id,type,date,notes,zone_name,strava_activity_id,strava_activity_name,strava_activity_km,created_at")
    .order("date", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = [...new Set((sessions ?? []).map((session) => String(session.user_strava_id)))];
  const { data: users } = userIds.length
    ? await ctx.db.from("users").select("strava_id,name,avatar,role,tier").in("strava_id", userIds)
    : { data: [] };
  const userById = new Map((users ?? []).map((user) => [String(user.strava_id), user]));

  return NextResponse.json({
    sessions: (sessions ?? []).map((session) => {
      const user = userById.get(String(session.user_strava_id));
      return {
        id: String(session.id),
        userId: String(session.user_strava_id),
        userName: user?.name ?? "Unknown rider",
        avatar: user?.avatar ?? "",
        tier: user?.tier ? Number(user.tier) : undefined,
        type: session.type,
        date: session.date,
        notes: session.notes ?? "",
        zoneName: session.zone_name ?? "",
        stravaActivityId: session.strava_activity_id,
        stravaActivityName: session.strava_activity_name ?? "",
        stravaActivityKm: session.strava_activity_km,
        createdAt: session.created_at,
      };
    }),
  });
}
