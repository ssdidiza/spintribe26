import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    const inviteCode = process.env.CHAMP_INVITE_CODE ?? "";
    const valid = typeof code === "string" && code.trim().toUpperCase() === inviteCode.toUpperCase();
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
