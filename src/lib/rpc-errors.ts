import type { RpcErrorCode } from "@/types/database";

/**
 * Maps cast_vote's machine-readable error codes (see
 * supabase/migrations/0002_event_lifecycle_and_scoring.sql) to copy safe
 * to show the audience. Never surface a raw database/network error.
 */
const MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  ALREADY_VOTED: "You have already voted for this performer.",
  PARTICIPANT_NOT_ACTIVE: "This performer is no longer on stage. The screen will update shortly.",
  EVENT_NOT_LIVE: "Voting is not currently active.",
  VOTING_NOT_OPEN: "Voting is not open right now.",
  INVALID_RATING: "Please choose a score from 1 to 5.",
};

const FALLBACK = "Something went wrong. Please check your connection and try again.";

export function friendlyVoteError(rawMessage: string | undefined | null): string {
  if (!rawMessage) return FALLBACK;
  return MESSAGES[rawMessage as RpcErrorCode] ?? FALLBACK;
}

export function isAlreadyVoted(rawMessage: string | undefined | null): boolean {
  return rawMessage === "ALREADY_VOTED";
}

export function isParticipantNoLongerActive(rawMessage: string | undefined | null): boolean {
  return rawMessage === "PARTICIPANT_NOT_ACTIVE" || rawMessage === "EVENT_NOT_LIVE";
}
