"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";
import { Button } from "@/components/ui/button";

const FIELD =
  "h-12 w-full border-2 border-foreground bg-background px-3 text-base";

function SubmitButton() {
  // Pending state comes from the form action itself, so a slow network
  // can't produce a second sign-in attempt from an impatient double-tap.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="lg" className="mt-2 w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [error, formAction] = useFormState(signIn, null);

  return (
    <form action={formAction} className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="eyebrow">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={FIELD}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="eyebrow">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground"
        >
          {error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
