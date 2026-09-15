"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
