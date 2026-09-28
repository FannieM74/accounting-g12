import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that do not require auth
const PUBLIC_PATH_PREFIXES = [
  "/_next",
  "/api",
  "/ui",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/static",
  "/assets",
  "/landing",
  "/login",
  "/signup",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public prefixes
  for (const p of PUBLIC_PATH_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p)) {
      return NextResponse.next();
    }
  }

  // Check session cookie existence  middleware must avoid DB calls (edge runtime)
  const token = request.cookies.get("acct12_session")?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/landing";
    // preserve original destination
    url.searchParams.set("next", request.nextUrl.pathname + (request.nextUrl.search || ""));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|ui|_next|landing|login|signup|favicon.ico|robots.txt|sitemap.xml).*)"],
};
