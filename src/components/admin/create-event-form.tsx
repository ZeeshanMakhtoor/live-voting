"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CreateEventFormProps {
  onCreate: (name: string) => Promise<void>;
}

export function CreateEventForm({ onCreate }: CreateEventFormProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(name.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-[3px] border-foreground p-6 sm:p-8">
      <p className="eyebrow">Nothing scheduled</p>
      <h1 className="font-display mt-2 text-4xl font-black leading-[0.95] tracking-tight">
        Create the event
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Name it, then build the running order. Nothing is visible to the audience until you start
        the first performer.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="eyebrow">Event name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Literary Club — Annual Showcase"
            required
            maxLength={200}
            className="h-12 border-2 border-foreground bg-background px-3 text-base"
          />
        </label>
        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={submitting || !name.trim()}
          className="mt-2"
        >
          {submitting ? "Creating…" : "Create event"}
        </Button>
      </form>
    </div>
  );
}
