"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getVoterId } from "@/lib/voter-id";
import { hasVotedFor, markVotedFor } from "@/lib/voted-store";
import { friendlyVoteError, isAlreadyVoted, isParticipantNoLongerActive } from "@/lib/rpc-errors";
import { logger } from "@/lib/logger";
import { RatingSlider } from "@/components/rating-slider";
import { Button } from "@/components/ui/button";
import type { Rating } from "@/types/domain";
import type { EventStatus, VotingState } from "@/types/database";

export interface EventState {
  id: string;
  status: EventStatus;
  active_participant_id: string | null;
  voting_state: VotingState;
}

export interface ParticipantState {
  id: string;
  name: string;
}

export interface TopRow {
  rank: number;
  name: string;
}

interface AudienceAppProps {
  initialEvent: EventState | null;
  initialParticipant: ParticipantState | null;
  initialTop3: TopRow[] | null;
}

function ParticipantHeader({ name }: { name: string }) {
  return (
    <div>
      <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Now performing
      </p>
      <h1 className="mt-2 text-center text-4xl font-black uppercase leading-tight sm:text-5xl">
        {name}
      </h1>
    </div>
  );
}

export function AudienceApp({ initialEvent, initialParticipant, initialTop3 }: AudienceAppProps) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [event, setEvent] = useState(initialEvent);
  const [participant, setParticipant] = useState(initialParticipant);
  const [top3, setTop3] = useState(initialTop3);
  const [voterId, setVoterId] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating>(3);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Starts null to match the server-rendered markup exactly (the server
  // has no access to localStorage); the real value is applied right
  // after mount below, same as voterId. Reading localStorage inside the
  // initial useState would desync the client's first render from the
  // server's and trigger a hydration mismatch.
  // "already_voted" only ever appears immediately after a duplicate
  // submission attempt catches ALREADY_VOTED; every other path
  // (including localStorage on load) uses "submitted".
  const [votedReason, setVotedReason] = useState<"submitted" | "already_voted" | null>(null);
  const [realtimeIssue, setRealtimeIssue] = useState(false);

  useEffect(() => {
    setVoterId(getVoterId());
  }, []);

  const loadEventState = useCallback(async () => {
    const { data: live } = await supabase
      .from("events")
      .select("id, status, active_participant_id, voting_state")
      .eq("status", "live")
      .maybeSingle();

    let nextEvent: EventState | null = live ?? null;

    if (!nextEvent) {
      const { data: finished } = await supabase
        .from("events")
        .select("id, status, active_participant_id, voting_state")
        .eq("status", "finished")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextEvent = finished ?? null;
    }

    setEvent(nextEvent);

    if (nextEvent?.status === "live" && nextEvent.active_participant_id) {
      const { data: p } = await supabase
        .from("participants")
        .select("id, name")
        .eq("id", nextEvent.active_participant_id)
        .maybeSingle();
      setParticipant(p ?? null);
    } else {
      setParticipant(null);
    }

    if (nextEvent?.status === "finished") {
      const { data: rows } = await supabase.rpc("get_public_top3", {
        p_event_id: nextEvent.id,
      });
      setTop3(rows ?? []);
    } else {
      setTop3(null);
    }
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("public-events-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        void loadEventState();
      })
      .subscribe((subStatus) => {
        const isIssue =
          subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT" || subStatus === "CLOSED";
        setRealtimeIssue(isIssue);
        if (isIssue) {
          logger.realtimeStatus({ app: "audience", status: subStatus });
        }
        // Realtime is a sync signal, not the source of truth: whatever
        // changed while we were disconnected (or during the initial
        // handshake) isn't replayed, so re-fetch on every (re)connect
        // rather than trusting whatever's already in state.
        if (subStatus === "SUBSCRIBED") {
          void loadEventState();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadEventState]);

  // Reset per-participant UI state whenever the active participant
  // changes. Deliberately keyed on the id, not the participant object,
  // so a same-participant re-render (e.g. from an unrelated realtime
  // refresh) doesn't reset an in-progress selection.
  const participantId = participant?.id ?? null;
  useEffect(() => {
    setVotedReason(participantId && hasVotedFor(participantId) ? "submitted" : null);
    setRating(3);
    setSubmitState("idle");
    setErrorMessage(null);
  }, [participantId]);

  async function handleSubmit() {
    if (!participant || !voterId || submitState === "submitting") return;

    setSubmitState("submitting");
    setErrorMessage(null);

    const { error } = await supabase.rpc("cast_vote", {
      p_participant_id: participant.id,
      p_voter_id: voterId,
      p_rating: rating,
    });

    if (error) {
      if (isAlreadyVoted(error.message)) {
        markVotedFor(participant.id);
        setVotedReason("already_voted");
        setSubmitState("idle");
        return;
      }

      setSubmitState("error");
      setErrorMessage(friendlyVoteError(error.message));
      logger.voteFailed({ participantId: participant.id, rating, code: error.message });

      if (isParticipantNoLongerActive(error.message)) {
        void loadEventState();
      }
      return;
    }

    markVotedFor(participant.id);
    setVotedReason("submitted");
    setSubmitState("idle");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b-4 border-foreground px-4 py-3">
        <p className="text-center text-xs font-bold uppercase tracking-[0.3em]">Literary Club</p>
        {realtimeIssue && (
          <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
            Reconnecting…
          </p>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <AudienceContent
          event={event}
          participant={participant}
          top3={top3}
          rating={rating}
          onRatingChange={setRating}
          votedReason={votedReason}
          submitState={submitState}
          errorMessage={errorMessage}
          canSubmit={Boolean(voterId)}
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  );
}

interface AudienceContentProps {
  event: EventState | null;
  participant: ParticipantState | null;
  top3: TopRow[] | null;
  rating: Rating;
  onRatingChange: (r: Rating) => void;
  votedReason: "submitted" | "already_voted" | null;
  submitState: "idle" | "submitting" | "error";
  errorMessage: string | null;
  canSubmit: boolean;
  onSubmit: () => void;
}

function AudienceContent({
  event,
  participant,
  top3,
  rating,
  onRatingChange,
  votedReason,
  submitState,
  errorMessage,
  canSubmit,
  onSubmit,
}: AudienceContentProps) {
  if (!event || (event.status === "live" && !participant)) {
    return (
      <div className="max-w-sm text-center">
        <p className="text-2xl font-black uppercase tracking-tight">
          Voting hasn&apos;t started yet.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Please wait for the event to begin.</p>
      </div>
    );
  }

  if (event.status === "finished") {
    return (
      <div className="w-full max-w-sm text-center">
        <p className="text-3xl font-black uppercase tracking-tight">Event Complete</p>
        <p className="mt-2 text-sm text-muted-foreground">Thank you for participating.</p>

        {top3 && top3.length > 0 && (
          <div className="mt-10 border-t-4 border-foreground pt-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Top 3
            </p>
            <ol className="mt-4 space-y-3">
              {top3.map((row) => (
                <li
                  key={row.rank}
                  className="flex items-center justify-center gap-3 border-b-2 border-foreground pb-2 text-left"
                >
                  <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {row.rank === 1 ? "1st" : row.rank === 2 ? "2nd" : "3rd"}
                  </span>
                  <span className="text-lg font-bold uppercase">— {row.name}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  // event.status === 'live' && participant is present from here on.
  if (!participant) return null;

  if (votedReason) {
    return (
      <div className="w-full max-w-sm">
        <ParticipantHeader name={participant.name} />
        <div className="mt-10 border-4 border-foreground px-6 py-8 text-center">
          <p className="text-2xl font-black uppercase">
            {votedReason === "already_voted"
              ? "You have already rated this participant."
              : "Rating submitted."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Thank you for voting.</p>
        </div>
      </div>
    );
  }

  if (event.voting_state === "not_started") {
    return (
      <div className="w-full max-w-sm">
        <ParticipantHeader name={participant.name} />
        <p className="mt-10 text-center text-lg font-bold uppercase tracking-wide">
          Voting hasn&apos;t started yet.
        </p>
      </div>
    );
  }

  if (event.voting_state === "paused") {
    return (
      <div className="w-full max-w-sm">
        <ParticipantHeader name={participant.name} />
        <p className="mt-10 text-center text-lg font-bold uppercase tracking-wide">
          Voting is temporarily paused.
        </p>
      </div>
    );
  }

  if (event.voting_state === "closed") {
    return (
      <div className="w-full max-w-sm">
        <ParticipantHeader name={participant.name} />
        <p className="mt-10 text-center text-lg font-bold uppercase tracking-wide">
          Voting for this participant is closed.
        </p>
      </div>
    );
  }

  // voting_state === 'open'
  return (
    <div className="w-full max-w-sm">
      <ParticipantHeader name={participant.name} />

      <div className="mt-10">
        <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Rate this performance
        </p>
        <div className="mt-5">
          <RatingSlider value={rating} onChange={onRatingChange} disabled={submitState === "submitting"} />
        </div>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="mt-5 border-2 border-destructive bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive"
        >
          {errorMessage}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="mt-6 w-full text-base uppercase tracking-wide"
        disabled={!canSubmit || submitState === "submitting"}
        onClick={onSubmit}
      >
        {submitState === "submitting" ? "Submitting…" : "Submit Rating"}
      </Button>
    </div>
  );
}
