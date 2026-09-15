import "server-only";
import { required } from "./env";

/**
 * Server-only secrets. Importing this module from any client component
 * fails the Next.js build immediately (that's what the `server-only`
 * import guards) — safer than a runtime check, since it can't be
 * accidentally shipped and silently no-op in production.
 *
 * Nothing in this codebase calls envServer.supabaseServiceRoleKey() yet
 * — the service role key bypasses RLS entirely, so it must only ever
 * be used in a one-off trusted server script (e.g. bootstrapping the
 * admin account), never in application request handling. Every normal
 * server/client operation goes through the anon key and RLS, exactly
 * as the rest of this codebase already does.
 */
export const envServer = {
  supabaseServiceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
};
