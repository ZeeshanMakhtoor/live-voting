"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b-4 border-foreground px-4 py-3">
        <p className="text-center text-xs font-bold uppercase tracking-[0.3em]">Literary Club</p>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Something went wrong loading the event. Please try again.
        </p>
        <Button onClick={reset}>Retry</Button>
      </main>
    </div>
  );
}
