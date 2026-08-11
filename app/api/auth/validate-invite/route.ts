import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    const inviteCode = process.env.CHAMP_INVITE_CODE?.trim() ?? "";
    const supplied = typeof code === "string" ? code.trim() : "";
    const valid = Boolean(inviteCode) && Boolean(supplied) && supplied.toUpperCase() === inviteCode.toUpperCase();
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
