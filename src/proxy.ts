import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
