import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Resolves a clean admin-app path ("/login", "/dashboard") to whatever
 * this request actually needs to redirect to. On the real admin
 * subdomain, middleware rewrites clean paths to /admin/* transparently,
 * so the clean path is correct and is what ends up in the browser's
 * address bar. Accessed directly by path (e.g. local dev without the
 * admin.<host> hosts-file entry), there's no such rewrite, so the
 * literal /admin/* path is used instead.
 */
export async function adminPath(path: string): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  return host === env.adminHost() ? path : `/admin${path}`;
}
