import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminPath } from "@/lib/admin-path";

// Never statically prerender anything under this group. A prerendered page
// can be served straight from Vercel's edge cache, bypassing middleware
// entirely — the auth check below is the real gate, not a backstop.
export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(await adminPath("/login"));
  }

  // A valid session is not the same as being an admin. Admin authority
  // lives in an allowlist (see the admin_users migration), so a signed-in
  // account that isn't on it gets turned away here rather than shown a
  // dashboard that RLS would silently empty out.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    redirect(await adminPath("/login?denied=1"));
  }

  return <>{children}</>;
}
