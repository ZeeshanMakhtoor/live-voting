import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { env } from "@/lib/env";

const PUBLIC_ADMIN_PATHS = new Set(["/login"]);

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const isAdminHost = host === env.adminHost();

  // On the admin host, a clean path ("/login", "/dashboard") is what's
  // actually in the browser's address bar; internally it's served from
  // /admin/*. Direct /admin/* access (any host) works too, for local dev
  // without an admin.<host> hosts-file entry.
  const cleanPath = isAdminHost && !url.pathname.startsWith("/admin");
  const effectivePath = cleanPath ? `/admin${url.pathname}` : url.pathname;
  const publicPath = cleanPath ? url.pathname : url.pathname.replace(/^\/admin/, "") || "/";

  const { response, user } = await updateSession(request);

  const isAdminRoute = effectivePath.startsWith("/admin");
  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.has(publicPath);

  if (isAdminRoute && !isPublicAdminPath && !user) {
    const loginUrl = new URL(isAdminHost ? "/login" : "/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (cleanPath) {
    const rewritten = url.clone();
    rewritten.pathname = effectivePath;
    return NextResponse.rewrite(rewritten, { headers: response.headers });
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
