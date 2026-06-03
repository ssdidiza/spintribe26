import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
  if (!status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: updated, error } = await ctx.db
    .from("tier_upgrade_requests")
    .update({
      status,
      admin_note: body.adminNote ?? "",
      decided_at: new Date().toISOString(),
      decided_by: ctx.userId,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from("notifications").insert({
    user_strava_id: updated.user_strava_id,
    type: "info",
    title: status === "approved" ? "League upgrade approved" : "League upgrade reviewed",
    body: status === "approved"
      ? `Your upgrade to ${updated.requested_tier} km is approved and takes effect on ${updated.effective_on}.`
      : `Your upgrade request was not approved this month. ${body.adminNote ?? ""}`.trim(),
  });

  return NextResponse.json({ request: updated });
}
