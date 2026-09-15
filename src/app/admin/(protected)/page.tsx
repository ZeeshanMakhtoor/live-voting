import { redirect } from "next/navigation";
import { adminPath } from "@/lib/admin-path";

export default async function AdminRootPage() {
  redirect(await adminPath("/dashboard"));
}
