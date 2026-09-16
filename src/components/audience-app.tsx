"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getVoterId } from "@/lib/voter-id";
import { hasVotedFor, markVotedFor } from "@/lib/voted-store";
import { friendlyVoteError, isAlreadyVoted, isParticipantNoLongerActive } from "@/lib/rpc-errors";
import { logger } from "@/lib/logger";
import { RatingScale } from "@/components/rating-scale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  batch: string | null;
  year: string | null;
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

const PARTICIPANT_FIELDS = "id, name, batch, year";

export function AudienceApp({ initialEvent, initialParticipant, initialTop3 }: AudienceAppProps) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [event, setEvent] = useState(initialEvent);
  const [participant, setParticipant] = useState(initialParticipant);
  const [top3, setTop3] = useState(initialTop3);
  const [voterId, setVoterId] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
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
        .select(PARTICIPANT_FIELDS)
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
    setRating(null);
    setSubmitState("idle");
    setErrorMessage(null);
  }, [participantId]);

  async function handleSubmit() {
    if (!participant || !voterId || rating === null || submitState === "submitting") return;

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
    <div className="flex min-h-viewport flex-col">
      <Masthead realtimeIssue={realtimeIssue} />

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8">
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

function Masthead({ realtimeIssue }: { realtimeIssue: boolean }) {
  return (
    <header className="rule-thick">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em]">Literary Club</p>
        {realtimeIssue ? (
          <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent">
            <span aria-hidden className="inline-block h-2 w-2 bg-accent" />
            Reconnecting
          </p>
        ) : (
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Live
          </p>
        )}
      </div>
    </header>
  );
}

/** Shared frame for every "nothing to do right now" state. */
function Notice({
  eyebrow,
  headline,
  detail,
  centered = true,
}: {
  eyebrow: string;
  headline: string;
  detail?: string;
  centered?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-[3px] border-foreground p-6 text-center sm:p-8",
        centered && "my-auto",
      )}
    >
      <p className="eyebrow">{eyebrow}</p>
      <p className="font-display mt-3 text-3xl font-black leading-[1.05] sm:text-4xl">{headline}</p>
      {detail && <p className="mt-3 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ParticipantHeader({ participant }: { participant: ParticipantState }) {
  const meta = [participant.batch, participant.year].filter(Boolean).join(" · ");
  return (
    <div className="border-b-[3px] border-foreground pb-6">
      <p className="eyebrow">Now performing</p>
      <h1 className="font-display mt-2 text-[2.75rem] font-black leading-[0.95] tracking-tight sm:text-6xl">
        {participant.name}
      </h1>
      {meta && (
        <p className="mt-3 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {meta}
        </p>
      )}
    </div>
  );
}

interface AudienceContentProps {
  event: EventState | null;
  participant: ParticipantState | null;
  top3: TopRow[] | null;
  rating: Rating | null;
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
  // No event at all, or the event is live but between performers.
  if (!event) {
    return (
      <Notice
        eyebrow="Not started"
        headline="Voting hasn't started yet."
        detail="Keep this page open — it updates on its own when the event begins."
      />
    );
  }

  if (event.status === "finished") {
    return <FinalResults top3={top3} />;
  }

  if (!participant) {
    return (
      <Notice
        eyebrow="Standing by"
        headline="Up next…"
        detail="The next performer will appear here automatically."
      />
    );
  }

  if (votedReason) {
    return (
      <div>
        <ParticipantHeader participant={participant} />
        <div className="mt-8 border-[3px] border-accent bg-accent px-6 py-10 text-center text-accent-foreground">
          <p className="font-display text-3xl font-black leading-tight sm:text-4xl">
            {votedReason === "already_voted" ? "Already rated." : "Rating submitted."}
          </p>
          <p className="mt-3 text-sm opacity-90">
            {votedReason === "already_voted"
              ? "You've already rated this performer."
              : "Thank you — your rating is recorded."}
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Stay on this page. The next performer appears automatically.
        </p>
      </div>
    );
  }

  if (event.voting_state !== "open") {
    const notice =
      event.voting_state === "paused"
        ? { eyebrow: "Paused", headline: "Voting is paused.", detail: "It will resume shortly." }
        : event.voting_state === "closed"
          ? {
              eyebrow: "Closed",
              headline: "Voting has closed.",
              detail: "Ratings for this performer are final.",
            }
          : {
              eyebrow: "Standing by",
              headline: "Voting opens shortly.",
              detail: "Rate as soon as the performance ends.",
            };
    return (
      <div>
        <ParticipantHeader participant={participant} />
        <div className="mt-8">
          <Notice {...notice} centered={false} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <ParticipantHeader participant={participant} />

      <div className="mt-8">
        <p className="eyebrow">Rate this performance</p>
        <div className="mt-4">
          <RatingScale
            name="rating"
            value={rating}
            onChange={onRatingChange}
            disabled={submitState === "submitting"}
          />
        </div>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="mt-6 border-2 border-destructive bg-destructive px-4 py-3 text-center text-sm font-bold text-destructive-foreground"
        >
          {errorMessage}
        </p>
      )}

      <Button
        type="button"
        variant={rating === null ? "muted" : "accent"}
        size="lg"
        className="mt-8 w-full text-lg"
        disabled={!canSubmit || rating === null || submitState === "submitting"}
        onClick={onSubmit}
      >
        {submitState === "submitting"
          ? "Submitting…"
          : rating === null
            ? "Select a rating"
            : `Submit ${rating}`}
      </Button>

      <p className="mt-6 text-center text-xs uppercase tracking-[0.15em] text-muted-foreground">
        One rating per performer
      </p>

      <p aria-live="polite" className="sr-only">
        {submitState === "submitting" ? "Submitting your rating" : ""}
      </p>
    </div>
  );
}

function FinalResults({ top3 }: { top3: TopRow[] | null }) {
  return (
    <div>
      <div className="border-b-[3px] border-foreground pb-6 text-center">
        <p className="eyebrow">The end</p>
        <p className="font-display mt-2 text-4xl font-black leading-[0.95] sm:text-5xl">
          Event complete
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Thank you for voting.</p>
      </div>

      {top3 && top3.length > 0 ? (
        <div className="mt-8">
          <p className="eyebrow text-center">Top 3</p>
          <ol className="mt-4">
            {top3.map((row) => (
              <li
                key={row.rank}
                className="flex items-center gap-5 border-b-2 border-foreground py-4 last:border-b-0"
              >
                <span className="numeral w-14 shrink-0 text-5xl leading-none text-accent sm:text-6xl">
                  {row.rank}
                </span>
                <span className="font-display text-xl font-black uppercase leading-tight sm:text-2xl">
                  {row.name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Final results will appear here shortly.
        </p>
      )}
    </div>
  );
}
