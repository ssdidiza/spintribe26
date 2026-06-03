import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { getFeedbackBoard } from "@/lib/feedback-data";

export async function GET() {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const items = await getFeedbackBoard(ctx.db, ctx.userId);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feedback fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
