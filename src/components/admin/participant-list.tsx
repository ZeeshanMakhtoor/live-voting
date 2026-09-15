"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ParticipantRow, LeaderboardRow } from "./dashboard";

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
    <section className="border-4 border-foreground">
      <header className="border-b-4 border-foreground bg-foreground px-4 py-2">
        <h2 className="text-sm font-black uppercase tracking-[0.15em] text-background">
          Participants
        </h2>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-foreground text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-bold">#</th>
              <th className="px-3 py-2 font-bold">Name</th>
              <th className="px-3 py-2 font-bold">Batch</th>
              <th className="px-3 py-2 font-bold">Year</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-3 py-2 font-bold">Votes</th>
              <th className="px-3 py-2 font-bold">Avg</th>
              <th className="px-3 py-2 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, idx) => {
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
                  <td className="px-3 py-2 font-mono tabular-nums">
                    {String(p.display_order).padStart(2, "0")}
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
                        title="Move up"
                        className="border border-foreground px-1.5 py-0.5 text-xs disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMove(p.id, "down")}
                        title="Move down"
                        className="border border-foreground px-1.5 py-0.5 text-xs disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(p.id)}
                        className="border border-foreground px-1.5 py-0.5 text-xs uppercase disabled:opacity-40"
                      >
                        Edit
                      </button>
                      {!isActive && (
                        <button
                          type="button"
                          disabled={busy || p.status === "active"}
                          onClick={() => onStart(p.id)}
                          className="border border-foreground px-1.5 py-0.5 text-xs uppercase disabled:opacity-40"
                        >
                          Start
                        </button>
                      )}
                      {p.status !== "skipped" && p.status !== "completed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSkip(p.id)}
                          className="border border-foreground px-1.5 py-0.5 text-xs uppercase disabled:opacity-40"
                        >
                          Skip
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || hasVotes}
                        title={hasVotes ? "Cannot remove — has recorded votes" : undefined}
                        onClick={() => onRemove(p.id)}
                        className="border border-destructive px-1.5 py-0.5 text-xs uppercase text-destructive disabled:opacity-40"
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
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No participants yet — add one below.
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

  return (
    <tr className="border-b border-foreground/20 bg-muted">
      <td className="px-3 py-2 font-mono tabular-nums">
        {String(participant.display_order).padStart(2, "0")}
      </td>
      <td className="px-2 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-full border-2 border-foreground bg-background px-2 text-sm"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          className="h-9 w-full border-2 border-foreground bg-background px-2 text-sm"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-9 w-full border-2 border-foreground bg-background px-2 text-sm"
        />
      </td>
      <td colSpan={3} />
      <td className="px-3 py-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), batch: batch.trim(), year: year.trim() })}
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAdd({ name: name.trim(), batch: batch.trim(), year: year.trim() });
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
      className="flex flex-wrap items-end gap-3 border-t-4 border-foreground p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aisha Khan"
          required
          className="h-10 w-48 border-2 border-foreground bg-background px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Batch
        </span>
        <input
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder="BTech CSE"
          className="h-10 w-40 border-2 border-foreground bg-background px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Year
        </span>
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="2028"
          className="h-10 w-24 border-2 border-foreground bg-background px-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={busy || submitting || !name.trim()} className="uppercase">
        {submitting ? "Adding…" : "Add Participant"}
      </Button>
    </form>
  );
}
