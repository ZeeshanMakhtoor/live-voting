import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Browser Supabase client. Uses the public anon key, so it is safe to
 * call from client components. All access control is enforced by RLS
 * on the database, never by this client.
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl(), env.supabaseAnonKey());
}
