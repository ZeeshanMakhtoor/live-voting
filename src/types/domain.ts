import type { EventStatus, ParticipantStatus } from "./database";

export type { EventStatus, ParticipantStatus };

export interface Event {
  id: string;
  name: string;
  status: EventStatus;
  activeParticipantId: string | null;
  votingOpen: boolean;
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

/** Admin-facing result row. Never exposed to the audience app. */
export interface ParticipantResult {
  participantId: string;
  name: string;
  batch: string | null;
  year: string | null;
  displayOrder: number;
  status: ParticipantStatus;
  voteCount: number;
  averageRating: number | null;
}

export type Rating = 1 | 2 | 3 | 4 | 5;
