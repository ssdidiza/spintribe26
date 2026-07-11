import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-auth";
import { connectXeroFromAuthorizationCode } from "@/lib/xero";

function adminRedirect(req: NextRequest, status: string) {
  const url = new URL("/admin", req.url);
  url.searchParams.set("xero", status);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const ctx = await getAdminContext();
  if ("error" in ctx) return adminRedirect(req, "unauthorized");

  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("xero_oauth_state")?.value;
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code) return adminRedirect(req, "denied");
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return adminRedirect(req, "invalid_state");
  }

  try {
    await connectXeroFromAuthorizationCode({ code, origin: req.nextUrl.origin });
    const response = adminRedirect(req, "connected");
    response.cookies.delete("xero_oauth_state");
    return response;
  } catch (error) {
    console.error("Xero OAuth callback failed:", error);
    return adminRedirect(req, "error");
  }
}
