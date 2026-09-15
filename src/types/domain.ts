import type { EventStatus, ParticipantStatus, RpcErrorCode, VotingState } from "./database";

export type { EventStatus, ParticipantStatus, RpcErrorCode, VotingState };

export interface Event {
  id: string;
  name: string;
  status: EventStatus;
  activeParticipantId: string | null;
  votingState: VotingState;
}

export interface Participant {
  id: string;
  eventId: string;
  name: string;
  batch: string | null;
  year: string | null;
  displayOrder: number;
  status: ParticipantStatus;
}

/**
 * Admin-facing leaderboard row (from get_leaderboard). Never exposed to
 * the audience app — see participant_scores/get_leaderboard RLS/grants.
 * Tie-break order (applied in SQL, not here): average_rating desc,
 * vote_count desc, total_rating_points desc, display_order asc.
 */
export interface LeaderboardRow {
  rank: number;
  participantId: string;
  name: string;
  batch: string | null;
  year: string | null;
  displayOrder: number;
  status: ParticipantStatus;
  voteCount: number;
  totalRatingPoints: number;
  averageRating: number | null;
}

export type Rating = 1 | 2 | 3 | 4 | 5;
