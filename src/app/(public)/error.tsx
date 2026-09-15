"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-muted-foreground">
        Something went wrong loading the event. Please try again.
      </p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
