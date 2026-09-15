import { describe, expect, it } from "vitest";
import {
  friendlyVoteError,
  isAlreadyVoted,
  isParticipantNoLongerActive,
} from "@/lib/rpc-errors";

// cast_vote raises bare sentinel strings (RAISE EXCEPTION 'ALREADY_VOTED'),
// which PostgREST surfaces as SQLSTATE P0001 with the message verbatim, so
// supabase-js hands us exactly these strings on error.message.
describe("vote error mapping", () => {
  it("explains a duplicate vote rather than showing a generic failure", () => {
    expect(friendlyVoteError("ALREADY_VOTED")).toMatch(/already rated/i);
  });

  it("maps every sentinel cast_vote can raise to specific copy", () => {
    for (const code of [
      "ALREADY_VOTED",
      "PARTICIPANT_NOT_ACTIVE",
      "EVENT_NOT_LIVE",
      "VOTING_NOT_OPEN",
      "INVALID_RATING",
    ]) {
      expect(friendlyVoteError(code)).not.toBe(friendlyVoteError("some-unmapped-error"));
    }
  });

  it("never leaks a raw database or network error to the audience", () => {
    const raw = 'duplicate key value violates unique constraint "votes_event_id_participant_id_voter_id_key"';
    const shown = friendlyVoteError(raw);
    expect(shown).not.toContain("constraint");
    expect(shown).not.toContain("votes_");
    expect(shown).toMatch(/something went wrong/i);
  });

  it("falls back safely on null/undefined/empty", () => {
    for (const v of [null, undefined, ""]) {
      expect(friendlyVoteError(v)).toMatch(/something went wrong/i);
    }
  });

  it("detects a duplicate vote only on the exact sentinel", () => {
    expect(isAlreadyVoted("ALREADY_VOTED")).toBe(true);
    expect(isAlreadyVoted("already_voted")).toBe(false);
    expect(isAlreadyVoted("VOTING_NOT_OPEN")).toBe(false);
    expect(isAlreadyVoted(null)).toBe(false);
  });

  // These two are what trigger a re-fetch of event state, which is how a
  // client holding a stale participant recovers after an admin advanced.
  it("treats stale-participant errors as a signal to resync", () => {
    expect(isParticipantNoLongerActive("PARTICIPANT_NOT_ACTIVE")).toBe(true);
    expect(isParticipantNoLongerActive("EVENT_NOT_LIVE")).toBe(true);
  });

  it("does not resync on errors that are not about stale state", () => {
    expect(isParticipantNoLongerActive("ALREADY_VOTED")).toBe(false);
    expect(isParticipantNoLongerActive("VOTING_NOT_OPEN")).toBe(false);
    expect(isParticipantNoLongerActive(null)).toBe(false);
  });
});
