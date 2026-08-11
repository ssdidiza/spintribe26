import { NextRequest, NextResponse } from "next/server";
import { isChampSignupConfigured, isValidChampInviteCode } from "@/lib/champ-auth";

export const runtime = "nodejs";

/**
 * Convenience pre-check for the /join form so a rider learns the code is wrong
 * before filling in the rest. It grants NOTHING on its own — /api/auth/join
 * re-checks the same code server-side before creating an account.
 *
 * Previously this compared against an unset env var, so a bare "" submission
 * matched "" and returned valid. isValidChampInviteCode closes that: no code
 * configured means signup is closed, not open.
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    return NextResponse.json({
      valid: isValidChampInviteCode(code),
      configured: isChampSignupConfigured(),
    });
  } catch {
    return NextResponse.json({ valid: false, configured: isChampSignupConfigured() });
  }
}
