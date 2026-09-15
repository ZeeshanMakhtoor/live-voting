import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Server Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes the auth session via cookies, so the
 * admin app's authenticated requests are correctly scoped per-request.
 * Still uses the anon key: RLS (not this client) decides what an
 * authenticated admin session may access.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies directly.
          // Session refresh is handled in middleware instead; safe to ignore.
        }
      },
    },
  });
}
