"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminPath } from "@/lib/admin-path";
import { logger } from "@/lib/logger";

export async function signIn(_prevState: string | null, formData: FormData): Promise<string> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return "Email and password are required.";
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logger.loginFailed();
    return "Invalid email or password.";
  }

  redirect(await adminPath("/dashboard"));
}
