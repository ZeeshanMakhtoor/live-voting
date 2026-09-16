import type { RpcErrorCode } from "@/types/database";

/**
 * Maps an admin RPC's raw error code to a specific, safe sentence for
 * the given action — never a raw Postgres/PostgREST error. Keyed by
 * action because the same code reads differently depending on what was
 * attempted (e.g. VOTING_NOT_OPEN means something different for "pause"
 * than for "close").
 */
export type AdminAction =
  | "createEvent"
  | "addParticipant"
  | "editParticipant"
  | "startParticipant"
  | "nextParticipant"
  | "previousParticipant"
  | "skipParticipant"
  | "removeParticipant"
  | "reorderParticipant"
  | "openVoting"
  | "pauseVoting"
  | "resumeVoting"
  | "closeVoting"
  | "finishEvent"
  | "deleteEvent";

const ACTION_MESSAGES: Partial<Record<AdminAction, Partial<Record<RpcErrorCode, string>>>> = {
  deleteEvent: {
    EVENT_IS_LIVE: "A live event can't be deleted. Finish it first.",
    EVENT_NOT_FOUND: "That event no longer exists.",
  },
  startParticipant: {
    PARTICIPANT_REMOVED: "Cannot start a removed participant.",
    EVENT_FINISHED: "This event has already finished.",
  },
  nextParticipant: {
    NO_MORE_PARTICIPANTS: "There are no more participants to move to.",
    EVENT_FINISHED: "This event has already finished.",
  },
  previousParticipant: {
    NO_PREVIOUS_PARTICIPANT: "There is no previous participant to go back to.",
    EVENT_FINISHED: "This event has already finished.",
  },
  skipParticipant: {
    PARTICIPANT_NOT_FOUND: "Participant could not be skipped.",
  },
  removeParticipant: {
    PARTICIPANT_HAS_VOTES: "Cannot remove a participant who already has votes recorded.",
    PARTICIPANT_NOT_FOUND: "Participant could not be removed.",
  },
  openVoting: {
    NO_ACTIVE_PARTICIPANT: "Cannot start voting because no active participant exists.",
    EVENT_NOT_LIVE: "Cannot start voting before the event is live.",
    VOTING_ALREADY_CLOSED:
      "Voting for this participant is already closed. Move to another participant to vote again.",
  },
  pauseVoting: {
    VOTING_NOT_OPEN: "Voting is not currently open, so it can't be paused.",
  },
  resumeVoting: {
    NO_ACTIVE_PARTICIPANT: "Cannot resume voting because no active participant exists.",
    EVENT_NOT_LIVE: "Cannot resume voting before the event is live.",
    VOTING_ALREADY_CLOSED:
      "Voting for this participant is already closed. Move to another participant to vote again.",
  },
  closeVoting: {
    VOTING_NOT_OPEN: "Voting is already closed.",
  },
  finishEvent: {
    EVENT_NOT_FOUND: "This event no longer exists.",
  },
};

const GENERIC_FALLBACKS: Record<AdminAction, string> = {
  createEvent: "Could not create the event. Please try again.",
  addParticipant: "Could not add the participant. Please try again.",
  editParticipant: "Could not save participant details. Please try again.",
  startParticipant: "Could not start this participant. Please try again.",
  nextParticipant: "Could not move to the next participant. Please try again.",
  previousParticipant: "Could not move to the previous participant. Please try again.",
  skipParticipant: "Participant could not be skipped.",
  removeParticipant: "Participant could not be removed.",
  reorderParticipant: "Could not reorder participants. Please try again.",
  openVoting: "Could not start voting. Please try again.",
  pauseVoting: "Could not pause voting. Please try again.",
  resumeVoting: "Could not resume voting. Please try again.",
  closeVoting: "Could not close voting. Please try again.",
  finishEvent: "Could not finish the event. Please try again.",
  deleteEvent: "Could not delete the event. Please try again.",
};

export function friendlyAdminError(action: AdminAction, rawMessage: string | undefined | null): string {
  if (!rawMessage) return GENERIC_FALLBACKS[action];
  const specific = ACTION_MESSAGES[action]?.[rawMessage as RpcErrorCode];
  return specific ?? GENERIC_FALLBACKS[action];
}
