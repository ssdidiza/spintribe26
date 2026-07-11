import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { getXeroAuthorizationUrl } from "@/lib/xero";

export async function GET(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const state = randomBytes(24).toString("hex");
    const response = NextResponse.redirect(getXeroAuthorizationUrl({
      origin: req.nextUrl.origin,
      state,
    }));
    response.cookies.set("xero_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Xero authorization";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
