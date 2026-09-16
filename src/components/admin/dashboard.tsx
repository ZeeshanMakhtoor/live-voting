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

/** How long votes are allowed to pile up before one refresh covers them all. */
const VOTE_REFRESH_WINDOW_MS = 700;

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

  // Votes arrive in bursts — 100 people rating the same performer within
  // a couple of seconds is the normal case, and refreshing per payload
  // would mean 100 full re-derives (three queries each) back to back.
  // Coalesce them: the first vote schedules one refresh and every vote
  // landing inside that window rides along with it.
  const voteRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleVoteRefresh = useCallback(() => {
    if (voteRefreshTimer.current) return;
    voteRefreshTimer.current = setTimeout(() => {
      voteRefreshTimer.current = null;
      void refresh();
    }, VOTE_REFRESH_WINDOW_MS);
  }, [refresh]);

  useEffect(
    () => () => {
      if (voteRefreshTimer.current) clearTimeout(voteRefreshTimer.current);
    },
    [],
  );

  // One subscription per relevant table; every payload just triggers a
  // full re-derive rather than patching state from the payload — simpler
  // and correct whether the change came from this admin's own action or
  // an audience member's vote landing. Event and participant changes are
  // rare and need to show immediately; votes are debounced above.
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
        scheduleVoteRefresh();
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
  }, [supabase, refresh, scheduleVoteRefresh]);

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
      <div className="min-h-viewport">
        <DashboardHeader onLogout={handleLogout} realtimeIssue={realtimeIssue} />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <CreateEventForm onCreate={handleCreateEvent} />
        </div>
      </div>
    );
  }

  const activeParticipant = participants.find((p) => p.id === event.active_participant_id) ?? null;
  const activeScore =
    leaderboard.find((s) => s.participant_id === event.active_participant_id) ?? null;
  const totalRatings = leaderboard.reduce((sum, s) => sum + s.vote_count, 0);
  const remaining = participants.filter((p) => p.status === "upcoming").length;
  const counts = {
    total: participants.filter((p) => p.status !== "removed").length,
    completed: participants.filter((p) => p.status === "completed").length,
    skipped: participants.filter((p) => p.status === "skipped").length,
  };
  const isFinished = event.status === "finished";

  return (
    <div className="min-h-viewport">
      <DashboardHeader onLogout={handleLogout} realtimeIssue={realtimeIssue} />

      <div className="mx-auto max-w-6xl px-4 py-6">
        {errorMessage && (
          <p
            role="alert"
            className="mb-6 border-2 border-destructive bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground"
          >
            {errorMessage}
          </p>
        )}

        <StagePanel
          event={event}
          activeParticipant={activeParticipant}
          activeScore={activeScore}
          busy={busy}
          onNext={() =>
            void callRpc("nextParticipant", "admin_next_participant", { p_event_id: event.id })
          }
          onPrevious={() =>
            void callRpc("previousParticipant", "admin_previous_participant", {
              p_event_id: event.id,
            })
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
            const action: AdminAction =
              event.voting_state === "paused" ? "resumeVoting" : "openVoting";
            void callRpc(action, "admin_open_voting", { p_event_id: event.id });
          }}
          onPauseVoting={() =>
            void callRpc("pauseVoting", "admin_pause_voting", { p_event_id: event.id })
          }
          onCloseVoting={() =>
            void callRpc("closeVoting", "admin_close_voting", { p_event_id: event.id })
          }
        />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile label="Ratings this performer" value={activeScore?.vote_count ?? 0} accent />
          <StatTile
            label="Average now"
            value={
              activeScore?.average_rating != null
                ? Number(activeScore.average_rating).toFixed(2)
                : "—"
            }
          />
          <StatTile label="Remaining" value={remaining} />
          <StatTile label="Completed" value={counts.completed} />
          <StatTile label="Total ratings" value={totalRatings} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <LiveLeaderboard
            leaderboard={leaderboard}
            eventName={event.name}
            finished={isFinished}
          />
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

        {/* Finishing is irreversible and ends voting for everyone, so it
            lives apart from the controls used every two minutes rather
            than one mis-tap away from "Next Participant". */}
        <section className="mt-8 border-2 border-destructive p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-destructive">
                End of event
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isFinished
                  ? "This event is finished. Results below are final."
                  : "Closes voting permanently and reveals the top 3 to the audience."}
              </p>
            </div>
            <Button
              variant="destructive"
              disabled={busy || isFinished}
              onClick={() => {
                if (
                  !window.confirm(
                    "Are you sure you want to finish this event? Voting will no longer be available.",
                  )
                )
                  return;
                void callRpc("finishEvent", "admin_finish_event", { p_event_id: event.id });
              }}
            >
              {isFinished ? "Event finished" : "Finish event"}
            </Button>
          </div>
        </section>
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
    <header className="rule-thick">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em]">Literary Club</p>
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          <p className="font-display text-lg font-black uppercase tracking-tight">Admin</p>
        </div>
        <div className="flex items-center gap-4">
          <p
            className={cn(
              "text-[0.65rem] font-bold uppercase tracking-[0.15em]",
              realtimeIssue ? "text-accent" : "text-muted-foreground",
            )}
          >
            {realtimeIssue ? "Reconnecting" : "Live"}
          </p>
          <Button variant="outline" size="sm" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}

const VOTING_LABEL: Record<VotingState, string> = {
  not_started: "Not started",
  open: "Open",
  paused: "Paused",
  closed: "Closed",
};

/**
 * The one panel the admin looks at all night: who is on stage, whether
 * voting is open, and the single next thing to press.
 */
function StagePanel({
  event,
  activeParticipant,
  activeScore,
  busy,
  onNext,
  onPrevious,
  onSkipCurrent,
  onOpenVoting,
  onPauseVoting,
  onCloseVoting,
}: {
  event: EventRow;
  activeParticipant: ParticipantRow | null;
  activeScore: LeaderboardRow | null;
  busy: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkipCurrent: () => void;
  onOpenVoting: () => void;
  onPauseVoting: () => void;
  onCloseVoting: () => void;
}) {
  const isFinished = event.status === "finished";
  const votingOpen = event.voting_state === "open";

  // Exactly one recommended next step, derived from current state, so the
  // admin never has to work out which of six buttons applies right now.
  const primary = isFinished
    ? null
    : !activeParticipant
      ? { label: "Start next performer", onClick: onNext }
      : event.voting_state === "not_started"
        ? { label: "Open voting", onClick: onOpenVoting }
        : event.voting_state === "open"
          ? { label: "Close voting", onClick: onCloseVoting }
          : event.voting_state === "paused"
            ? { label: "Resume voting", onClick: onOpenVoting }
            : { label: "Next performer", onClick: onNext };

  return (
    <section className="border-[3px] border-foreground">
      <div className="grid gap-0 md:grid-cols-[1fr_auto]">
        <div className="border-b-[3px] border-foreground p-5 md:border-b-0 md:border-r-[3px]">
          <p className="eyebrow">On stage now</p>
          <p className="font-display mt-2 text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl">
            {activeParticipant ? activeParticipant.name : isFinished ? "Event finished" : "Nobody yet"}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {activeParticipant
              ? [activeParticipant.batch, activeParticipant.year].filter(Boolean).join(" · ") ||
                event.name
              : event.name}
          </p>
        </div>

        <div className="flex min-w-[13rem] flex-col justify-center p-5">
          <p className="eyebrow">Voting</p>
          <p
            className={cn(
              "font-display mt-1 text-3xl font-black uppercase leading-none",
              votingOpen ? "text-accent" : "text-foreground",
            )}
          >
            {VOTING_LABEL[event.voting_state]}
          </p>
          {activeParticipant && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="numeral text-xl text-foreground">
                {activeScore?.vote_count ?? 0}
              </span>{" "}
              ratings in
            </p>
          )}
        </div>
      </div>

      {!isFinished && (
        <div className="border-t-[3px] border-foreground p-4">
          {primary && (
            <Button
              variant="accent"
              size="lg"
              className="w-full text-lg"
              disabled={busy}
              onClick={primary.onClick}
            >
              {busy ? "Working…" : primary.label}
            </Button>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onPrevious}>
              ← Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !activeParticipant}
              onClick={onSkipCurrent}
            >
              Skip current
            </Button>
            {votingOpen && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onPauseVoting}>
                Pause voting
              </Button>
            )}
            {event.voting_state === "paused" && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onCloseVoting}>
                Close voting
              </Button>
            )}
            {activeParticipant && event.voting_state === "closed" && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onNext}>
                Next performer
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className={cn("border-2 p-3", accent ? "border-accent" : "border-foreground")}>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("numeral mt-1 text-3xl", accent && "text-accent")}>{value}</p>
    </div>
  );
}
