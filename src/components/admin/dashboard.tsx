"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { friendlyAdminError, type AdminAction } from "@/lib/admin-errors";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreateEventForm } from "./create-event-form";
import { ParticipantList } from "./participant-list";
import { LiveLeaderboard } from "./live-leaderboard";
import type { EventStatus, ParticipantStatus, VotingState } from "@/types/database";

export interface EventRow {
  id: string;
  name: string;
  status: EventStatus;
  active_participant_id: string | null;
  voting_state: VotingState;
}

export interface ParticipantRow {
  id: string;
  event_id: string;
  name: string;
  batch: string | null;
  year: string | null;
  display_order: number;
  status: ParticipantStatus;
}

export interface LeaderboardRow {
  rank: number;
  participant_id: string;
  name: string;
  batch: string | null;
  year: string | null;
  display_order: number;
  status: ParticipantStatus;
  vote_count: number;
  total_rating_points: number;
  average_rating: number | null;
}

interface AdminDashboardProps {
  initialEvent: EventRow | null;
  initialParticipants: ParticipantRow[];
  initialLeaderboard: LeaderboardRow[];
}

function currentAdminLoginPath(): string {
  if (typeof window === "undefined") return "/admin/login";
  return window.location.host === env.adminHost() ? "/login" : "/admin/login";
}

export function AdminDashboard({
  initialEvent,
  initialParticipants,
  initialLeaderboard,
}: AdminDashboardProps) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const router = useRouter();

  const [event, setEvent] = useState(initialEvent);
  const [participants, setParticipants] = useState(initialParticipants);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [realtimeIssue, setRealtimeIssue] = useState(false);

  const refresh = useCallback(async () => {
    const { data: liveEvent } = await supabase
      .from("events")
      .select("id, name, status, active_participant_id, voting_state")
      .eq("status", "live")
      .maybeSingle();

    let nextEvent: EventRow | null = liveEvent ?? null;
    if (!nextEvent) {
      const { data: draftEvent } = await supabase
        .from("events")
        .select("id, name, status, active_participant_id, voting_state")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextEvent = draftEvent ?? null;
    }
    if (!nextEvent) {
      const { data: finishedEvent } = await supabase
        .from("events")
        .select("id, name, status, active_participant_id, voting_state")
        .eq("status", "finished")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextEvent = finishedEvent ?? null;
    }

    setEvent(nextEvent);

    if (nextEvent) {
      const [{ data: participantRows }, { data: leaderboardRows }] = await Promise.all([
        supabase
          .from("participants")
          .select("id, event_id, name, batch, year, display_order, status")
          .eq("event_id", nextEvent.id)
          .order("display_order", { ascending: true }),
        // Ranking is computed server-side (average -> votes -> points ->
        // display_order tie-break) — never pull raw votes into the
        // browser to rank them here.
        supabase.rpc("get_leaderboard", { p_event_id: nextEvent.id }),
      ]);
      setParticipants(participantRows ?? []);
      setLeaderboard(leaderboardRows ?? []);
    } else {
      setParticipants([]);
      setLeaderboard([]);
    }
  }, [supabase]);

  // One subscription per relevant table; every payload just triggers a
  // full re-derive rather than patching state from the payload — simpler
  // and correct whether the change came from this admin's own action or
  // an audience member's vote landing.
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => {
        void refresh();
      })
      .subscribe((subStatus) => {
        const isIssue =
          subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT" || subStatus === "CLOSED";
        setRealtimeIssue(isIssue);
        if (isIssue) {
          logger.realtimeStatus({ app: "admin", status: subStatus });
        }
        // Same reasoning as the audience app: re-fetch on every
        // (re)connect, since a missed change during a disconnect is
        // never replayed and realtime is sync, not the source of truth.
        if (subStatus === "SUBSCRIBED") {
          void refresh();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  async function callRpc(
    action: AdminAction,
    name:
      | "admin_start_participant"
      | "admin_next_participant"
      | "admin_previous_participant"
      | "admin_skip_participant"
      | "admin_remove_participant"
      | "admin_swap_participant_order"
      | "admin_open_voting"
      | "admin_pause_voting"
      | "admin_close_voting"
      | "admin_finish_event",
    args:
      | { p_event_id: string }
      | { p_event_id: string; p_participant_id: string }
      | { p_event_id: string; p_participant_id_a: string; p_participant_id_b: string },
  ) {
    setBusy(true);
    setErrorMessage(null);
    const { error } = await supabase.rpc(name, args);
    setBusy(false);
    if (error) {
      setErrorMessage(friendlyAdminError(action, error.message));
      logger.adminActionFailed({ action, code: error.message });
      return;
    }
    await refresh();
  }

  async function handleCreateEvent(name: string) {
    setErrorMessage(null);
    const { data, error } = await supabase
      .from("events")
      .insert({ name })
      .select("id, name, status, active_participant_id, voting_state")
      .single();
    if (error || !data) {
      setErrorMessage(friendlyAdminError("createEvent", error?.message));
      logger.adminActionFailed({ action: "createEvent", code: error?.message });
      return;
    }
    setEvent(data);
  }

  async function handleAddParticipant(values: { name: string; batch: string; year: string }) {
    if (!event) return;
    setErrorMessage(null);
    const nextOrder = participants.reduce((max, p) => Math.max(max, p.display_order), 0) + 1;
    const { error } = await supabase.from("participants").insert({
      event_id: event.id,
      name: values.name,
      batch: values.batch || null,
      year: values.year || null,
      display_order: nextOrder,
    });
    if (error) {
      setErrorMessage(friendlyAdminError("addParticipant", error.message));
      logger.adminActionFailed({ action: "addParticipant", code: error.message });
      return;
    }
    await refresh();
  }

  async function handleEditParticipant(
    id: string,
    values: { name: string; batch: string; year: string },
  ) {
    setErrorMessage(null);
    const { error } = await supabase
      .from("participants")
      .update({ name: values.name, batch: values.batch || null, year: values.year || null })
      .eq("id", id);
    if (error) {
      setErrorMessage(friendlyAdminError("editParticipant", error.message));
      logger.adminActionFailed({ action: "editParticipant", code: error.message });
      return;
    }
    await refresh();
  }

  function handleMove(id: string, direction: "up" | "down") {
    if (!event) return;
    const ordered = [...participants]
      .filter((p) => p.status !== "removed")
      .sort((a, b) => a.display_order - b.display_order);
    const idx = ordered.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    const neighbor = ordered[neighborIdx];
    if (!neighbor) return;
    void callRpc("reorderParticipant", "admin_swap_participant_order", {
      p_event_id: event.id,
      p_participant_id_a: id,
      p_participant_id_b: neighbor.id,
    });
  }

  function handleLogout() {
    void supabase.auth.signOut().then(() => {
      router.push(currentAdminLoginPath());
      router.refresh();
    });
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <DashboardHeader onLogout={handleLogout} realtimeIssue={realtimeIssue} />
        <CreateEventForm onCreate={handleCreateEvent} />
      </div>
    );
  }

  const activeParticipant = participants.find((p) => p.id === event.active_participant_id) ?? null;
  const activeScore =
    leaderboard.find((s) => s.participant_id === event.active_participant_id) ?? null;
  const totalRatings = leaderboard.reduce((sum, s) => sum + s.vote_count, 0);
  const counts = {
    total: participants.filter((p) => p.status !== "removed").length,
    completed: participants.filter((p) => p.status === "completed").length,
    upcoming: participants.filter((p) => p.status === "upcoming").length,
    skipped: participants.filter((p) => p.status === "skipped").length,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <DashboardHeader onLogout={handleLogout} realtimeIssue={realtimeIssue} />

      {errorMessage && (
        <p
          role="alert"
          className="mt-4 border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {errorMessage}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="border-4 border-foreground p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Event status
          </p>
          <p className="mt-1 text-3xl font-black uppercase">{event.status}</p>
          <p className="mt-3 truncate text-sm text-muted-foreground">{event.name}</p>
        </div>

        <div className="border-4 border-foreground p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Current participant
          </p>
          <p className="mt-1 text-2xl font-black uppercase">
            {activeParticipant ? activeParticipant.name : "—"}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Voting: <span className="text-foreground">{event.voting_state.replace("_", " ")}</span>
          </p>
        </div>
      </div>

      <LiveControls
        event={event}
        activeParticipant={activeParticipant}
        busy={busy}
        onNext={() => void callRpc("nextParticipant", "admin_next_participant", { p_event_id: event.id })}
        onPrevious={() =>
          void callRpc("previousParticipant", "admin_previous_participant", { p_event_id: event.id })
        }
        onSkipCurrent={() => {
          if (!activeParticipant) return;
          if (!window.confirm(`Skip ${activeParticipant.name}?`)) return;
          void callRpc("skipParticipant", "admin_skip_participant", {
            p_event_id: event.id,
            p_participant_id: activeParticipant.id,
          });
        }}
        onOpenVoting={() => {
          const action: AdminAction = event.voting_state === "paused" ? "resumeVoting" : "openVoting";
          void callRpc(action, "admin_open_voting", { p_event_id: event.id });
        }}
        onPauseVoting={() =>
          void callRpc("pauseVoting", "admin_pause_voting", { p_event_id: event.id })
        }
        onCloseVoting={() =>
          void callRpc("closeVoting", "admin_close_voting", { p_event_id: event.id })
        }
        onFinishEvent={() => {
          if (
            !window.confirm(
              "Are you sure you want to finish this event? Voting will no longer be available.",
            )
          )
            return;
          void callRpc("finishEvent", "admin_finish_event", { p_event_id: event.id });
        }}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Participants" value={counts.total} />
        <StatTile label="Completed" value={counts.completed} />
        <StatTile label="Upcoming" value={counts.upcoming} />
        <StatTile label="Skipped" value={counts.skipped} />
        <StatTile label="Total ratings" value={totalRatings} />
        <StatTile label="Current votes" value={activeScore?.vote_count ?? 0} />
        <StatTile
          label="Current avg"
          value={activeScore?.average_rating != null ? Number(activeScore.average_rating).toFixed(2) : "—"}
        />
      </div>

      <div className="mt-6">
        <LiveLeaderboard leaderboard={leaderboard} eventName={event.name} finished={event.status === "finished"} />
      </div>

      <div className="mt-6">
        <ParticipantList
          participants={participants}
          scores={leaderboard}
          activeParticipantId={event.active_participant_id}
          busy={busy}
          onAdd={handleAddParticipant}
          onEdit={handleEditParticipant}
          onStart={(id) =>
            void callRpc("startParticipant", "admin_start_participant", {
              p_event_id: event.id,
              p_participant_id: id,
            })
          }
          onSkip={(id) => {
            const p = participants.find((x) => x.id === id);
            if (p && !window.confirm(`Skip ${p.name}?`)) return;
            void callRpc("skipParticipant", "admin_skip_participant", {
              p_event_id: event.id,
              p_participant_id: id,
            });
          }}
          onRemove={(id) => {
            const p = participants.find((x) => x.id === id);
            if (p && !window.confirm(`Remove ${p.name}? This cannot be undone.`)) return;
            void callRpc("removeParticipant", "admin_remove_participant", {
              p_event_id: event.id,
              p_participant_id: id,
            });
          }}
          onMove={handleMove}
        />
      </div>
    </div>
  );
}

function DashboardHeader({
  onLogout,
  realtimeIssue,
}: {
  onLogout: () => void;
  realtimeIssue: boolean;
}) {
  return (
    <header className="flex items-center justify-between border-b-4 border-foreground pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em]">Literary Club</p>
        <h1 className="text-lg font-black uppercase tracking-tight">Live Voting — Admin</h1>
        {realtimeIssue && (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Reconnecting…
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="border-2 border-foreground px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
      >
        Log out
      </button>
    </header>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-foreground p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

interface LiveControlsProps {
  event: EventRow;
  activeParticipant: ParticipantRow | null;
  busy: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkipCurrent: () => void;
  onOpenVoting: () => void;
  onPauseVoting: () => void;
  onCloseVoting: () => void;
  onFinishEvent: () => void;
}

function LiveControls({
  event,
  activeParticipant,
  busy,
  onNext,
  onPrevious,
  onSkipCurrent,
  onOpenVoting,
  onPauseVoting,
  onCloseVoting,
  onFinishEvent,
}: LiveControlsProps) {
  const isFinished = event.status === "finished";
  const votingButton =
    event.voting_state === "open" ? (
      <>
        <ControlButton disabled={busy} onClick={onPauseVoting}>
          Pause Voting
        </ControlButton>
        <ControlButton disabled={busy} onClick={onCloseVoting}>
          Close Voting
        </ControlButton>
      </>
    ) : event.voting_state === "paused" ? (
      <>
        <ControlButton disabled={busy} onClick={onOpenVoting}>
          Resume Voting
        </ControlButton>
        <ControlButton disabled={busy} onClick={onCloseVoting}>
          Close Voting
        </ControlButton>
      </>
    ) : event.voting_state === "closed" ? (
      <ControlButton disabled className="opacity-50">
        Voting Closed
      </ControlButton>
    ) : (
      <ControlButton disabled={busy || !activeParticipant} onClick={onOpenVoting} primary>
        Start Voting
      </ControlButton>
    );

  return (
    <div className="mt-6 border-4 border-foreground p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Live controls
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ControlButton disabled={busy || isFinished} onClick={onPrevious}>
          ← Previous
        </ControlButton>
        <ControlButton disabled={busy || isFinished} onClick={onNext} primary={!activeParticipant}>
          {activeParticipant ? "Next Participant →" : "Start Event →"}
        </ControlButton>
        <ControlButton disabled={busy || isFinished || !activeParticipant} onClick={onSkipCurrent}>
          Skip Current
        </ControlButton>
        {!isFinished && votingButton}
        <ControlButton disabled={busy || isFinished} onClick={onFinishEvent} destructive>
          Finish Event
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
  primary,
  destructive,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-40",
        primary
          ? "border-accent bg-accent text-accent-foreground"
          : destructive
            ? "border-destructive text-destructive"
            : "border-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
