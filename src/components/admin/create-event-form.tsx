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
    <div className="mx-auto mt-16 w-full max-w-md border-4 border-foreground p-6">
      <h1 className="text-xl font-black uppercase tracking-tight">No event yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create the event to start managing participants and live voting.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Event name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Literary Club — Live Voting"
            required
            maxLength={200}
            className="h-11 border-2 border-foreground bg-background px-3 text-sm"
          />
        </label>
        <Button type="submit" disabled={submitting || !name.trim()} className="mt-1 uppercase">
          {submitting ? "Creating…" : "Create Event"}
        </Button>
      </form>
    </div>
  );
}
