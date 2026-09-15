"use client";

import { useFormState } from "react-dom";
import { signIn } from "./actions";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [error, formAction] = useFormState(signIn, null);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Sign in</Button>
    </form>
  );
}
