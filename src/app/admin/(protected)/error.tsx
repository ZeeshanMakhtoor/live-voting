"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    logger.pageError({ surface: "admin", code: error.message });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="border-[3px] border-destructive p-8">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-destructive">
          Dashboard error
        </p>
        <p className="font-display mt-3 text-3xl font-black leading-tight">
          The dashboard couldn&apos;t load.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          The event itself is unaffected — voting keeps running and no ratings are lost. Retry, or
          reload the page.
        </p>
        <Button variant="accent" size="lg" className="mt-6" onClick={reset}>
          Retry
        </Button>
      </div>
    </div>
  );
}
