"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ParticipantRow, LeaderboardRow } from "./dashboard";
import { validateParticipantInput } from "@/lib/participant-validation";

interface ParticipantListProps {
  participants: ParticipantRow[];
  scores: LeaderboardRow[];
  activeParticipantId: string | null;
  busy: boolean;
  onAdd: (values: { name: string; batch: string; year: string }) => Promise<void>;
  onEdit: (id: string, values: { name: string; batch: string; year: string }) => Promise<void>;
  onStart: (id: string) => void;
  onSkip: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  skipped: "Skipped",
  removed: "Removed",
};

export function ParticipantList({
  participants,
  scores,
  activeParticipantId,
  busy,
  onAdd,
  onEdit,
  onStart,
  onSkip,
  onRemove,
  onMove,
}: ParticipantListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const visible = participants.filter((p) => p.status !== "removed");
  const scoreByParticipant = new Map(scores.map((s) => [s.participant_id, s]));

  return (
    <section className="h-fit border-[3px] border-foreground">
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-foreground bg-foreground px-4 py-2.5">
        <h2 className="font-display text-base font-black uppercase tracking-[0.1em] text-background">
          Running order
        </h2>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-background/70">
          {visible.length} {visible.length === 1 ? "participant" : "participants"}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-foreground text-left [&>th]:px-3 [&>th]:py-2 [&>th]:text-[0.65rem] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.15em] [&>th]:text-muted-foreground">
              <th scope="col">#</th>
              <th scope="col">Name</th>
              <th scope="col">Batch</th>
              <th scope="col">Year</th>
              <th scope="col">Status</th>
              <th scope="col">Votes</th>
              <th scope="col">Avg</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const isActive = p.id === activeParticipantId;
              const score = scoreByParticipant.get(p.id);
              const hasVotes = (score?.vote_count ?? 0) > 0;
              const editing = editingId === p.id;

              if (editing) {
                return (
                  <EditRow
                    key={p.id}
                    participant={p}
                    busy={busy}
                    onCancel={() => setEditingId(null)}
                    onSave={async (values) => {
                      await onEdit(p.id, values);
                      setEditingId(null);
                    }}
                  />
                );
              }

              return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-foreground/20",
                    isActive && "bg-accent/10",
                  )}
                >
                  <td className="px-3 py-2">
                    <span className="numeral text-lg text-muted-foreground">
                      {String(p.display_order).padStart(2, "0")}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-bold">
                    {p.name}
                    {isActive && (
                      <span className="ml-2 border border-accent px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-accent">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.batch || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.year || "—"}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[p.status] ?? p.status}</td>
                  <td className="px-3 py-2 tabular-nums">{score?.vote_count ?? 0}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {score?.average_rating != null ? Number(score.average_rating).toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMove(p.id, "up")}
                        aria-label={`Move ${p.name} earlier in the running order`}
                        className="border border-foreground px-2 py-0.5 text-xs hover:bg-foreground/5 disabled:opacity-40"
                      >
                        <span aria-hidden>↑</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMove(p.id, "down")}
                        aria-label={`Move ${p.name} later in the running order`}
                        className="border border-foreground px-2 py-0.5 text-xs hover:bg-foreground/5 disabled:opacity-40"
                      >
                        <span aria-hidden>↓</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(p.id)}
                        aria-label={`Edit ${p.name}`}
                        className="border border-foreground px-2 py-0.5 text-xs font-bold uppercase tracking-wide hover:bg-foreground/5 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      {!isActive && (
                        <button
                          type="button"
                          disabled={busy || p.status === "active"}
                          onClick={() => onStart(p.id)}
                          aria-label={`Start ${p.name}`}
                          className="border border-foreground px-2 py-0.5 text-xs font-bold uppercase tracking-wide hover:bg-foreground/5 disabled:opacity-40"
                        >
                          Start
                        </button>
                      )}
                      {p.status !== "skipped" && p.status !== "completed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSkip(p.id)}
                          aria-label={`Skip ${p.name}`}
                          className="border border-foreground px-2 py-0.5 text-xs font-bold uppercase tracking-wide hover:bg-foreground/5 disabled:opacity-40"
                        >
                          Skip
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || hasVotes}
                        onClick={() => onRemove(p.id)}
                        aria-label={
                          hasVotes
                            ? `${p.name} cannot be removed because ratings have been recorded`
                            : `Remove ${p.name}`
                        }
                        className="border border-destructive px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center">
                  <p className="eyebrow">Empty running order</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Add your first participant below to build the running order.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddParticipantForm busy={busy} onAdd={onAdd} />
    </section>
  );
}

function EditRow({
  participant,
  busy,
  onSave,
  onCancel,
}: {
  participant: ParticipantRow;
  busy: boolean;
  onSave: (values: { name: string; batch: string; year: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(participant.name);
  const [batch, setBatch] = useState(participant.batch ?? "");
  const [year, setYear] = useState(participant.year ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const values = { name: name.trim(), batch: batch.trim(), year: year.trim() };
    const validationError = validateParticipantInput(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    void onSave(values);
  }

  return (
    <tr className="border-b border-foreground/20 bg-muted">
      <td className="px-3 py-2 font-mono tabular-nums">
        {String(participant.display_order).padStart(2, "0")}
      </td>
      <td className="px-2 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
          className="h-9 w-full border-2 border-foreground bg-background px-2 text-sm"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          maxLength={100}
          className="h-9 w-full border-2 border-foreground bg-background px-2 text-sm"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          maxLength={4}
          inputMode="numeric"
          className="h-9 w-full border-2 border-foreground bg-background px-2 text-sm"
        />
      </td>
      <td colSpan={3} />
      <td className="px-3 py-2">
        {error && <p className="mb-1 text-xs font-medium text-destructive">{error}</p>}
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={handleSave}
            className="border border-foreground bg-foreground px-2 py-1 text-xs font-bold uppercase text-background disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="border border-foreground px-2 py-1 text-xs uppercase"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddParticipantForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (values: { name: string; batch: string; year: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [batch, setBatch] = useState("");
  const [year, setYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const values = { name: name.trim(), batch: batch.trim(), year: year.trim() };
    const validationError = validateParticipantInput(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onAdd(values);
      setName("");
      setBatch("");
      setYear("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 border-t-[3px] border-foreground p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aisha Khan"
          required
          maxLength={150}
          className="h-10 w-48 border-2 border-foreground bg-background px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Batch</span>
        <input
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder="BTech CSE"
          maxLength={100}
          className="h-10 w-40 border-2 border-foreground bg-background px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Year</span>
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="2028"
          maxLength={4}
          inputMode="numeric"
          className="h-10 w-24 border-2 border-foreground bg-background px-2 text-sm"
        />
      </label>
      <Button type="submit" variant="outline" disabled={busy || submitting || !name.trim()}>
        {submitting ? "Adding…" : "Add participant"}
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
