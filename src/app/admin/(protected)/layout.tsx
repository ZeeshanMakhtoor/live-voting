import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    redirect("/admin/login");
  }

  return <>{children}</>;
}
