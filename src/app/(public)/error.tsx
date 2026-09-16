"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    logger.pageError({ surface: "audience", code: error.message });
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="rule-thick">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em]">Literary Club</p>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center px-4">
        <div className="w-full border-[3px] border-foreground p-8 text-center">
          <p className="eyebrow">Something went wrong</p>
          <p className="font-display mt-3 text-3xl font-black leading-tight">
            Couldn&apos;t load the event.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Your connection may have dropped. Nothing you submitted has been lost.
          </p>
          <Button variant="accent" size="lg" className="mt-6 w-full" onClick={reset}>
            Try again
          </Button>
        </div>
      </main>
    </div>
  );
}
