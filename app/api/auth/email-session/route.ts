import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const session = await getSession();
    session.userId = data.user.id;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("email-session error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
