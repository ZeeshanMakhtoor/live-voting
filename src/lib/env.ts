function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Safe to import from client or server code — every value here is
 * either NEXT_PUBLIC_ (already shipped to the browser bundle by
 * design) or has no confidentiality requirement. The service role key
 * deliberately lives in env.server.ts instead, guarded by the
 * `server-only` package, so an accidental client import fails the
 * build rather than silently resolving to undefined at runtime.
 */
export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  adminHost: () => process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.localhost:3000",
};

export { required };
