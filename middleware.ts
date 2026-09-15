import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { env } from "@/lib/env";

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login"]);

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const isAdminHost = host === env.adminHost();

  // admin.example.com/* -> internally served from /admin/*, so the same
  // Next.js app and deployment serves both experiences. Visiting /admin
  // directly on any host also works, which is convenient for local dev.
  if (isAdminHost && !url.pathname.startsWith("/admin")) {
    url.pathname = `/admin${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  const { response, user } = await updateSession(request);

  const isAdminRoute = url.pathname.startsWith("/admin");
  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.has(url.pathname);

  if (isAdminRoute && !isPublicAdminPath && !user) {
    const redirectUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
