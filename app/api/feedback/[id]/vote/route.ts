import { NextResponse } from "next/server";
import { getEffectiveUserId, getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userId = getEffectiveUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = supabaseAdmin();

  const { data: item, error: itemError } = await db
    .from("feedback_items")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const { data: existingVote, error: voteLookupError } = await db
    .from("feedback_votes")
    .select("feedback_item_id")
    .eq("feedback_item_id", id)
    .eq("user_strava_id", userId)
    .maybeSingle();

  if (voteLookupError) {
    return NextResponse.json({ error: voteLookupError.message }, { status: 500 });
  }

  if (existingVote) {
    const { error } = await db
      .from("feedback_votes")
      .delete()
      .eq("feedback_item_id", id)
      .eq("user_strava_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db
      .from("feedback_votes")
      .insert({ feedback_item_id: id, user_strava_id: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count, error: countError } = await db
    .from("feedback_votes")
    .select("feedback_item_id", { count: "exact", head: true })
    .eq("feedback_item_id", id);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  return NextResponse.json({ ok: true, hasVoted: !existingVote, voteCount: count ?? 0 });
}
