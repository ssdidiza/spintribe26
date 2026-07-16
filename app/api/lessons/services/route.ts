import { NextResponse } from "next/server";
import { LessonServiceRow, serializeLessonService } from "@/lib/lesson-services";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const preferredRegion = "cpt1";

// Public: lists the services shown on /book. No auth — this is the front door.
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("lesson_services")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("price_cents", { ascending: true });

    if (error) throw error;
    return NextResponse.json(
      {
        services: ((data ?? []) as LessonServiceRow[]).map(serializeLessonService),
      },
      {
        headers: {
          // Coaching products change rarely. Keeping this list at the edge
          // removes the first request in the availability waterfall.
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load services";
    return NextResponse.json({ error: message, services: [] }, { status: 500 });
  }
}
