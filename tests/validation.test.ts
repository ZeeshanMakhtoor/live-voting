import { describe, expect, it } from "vitest";
import { PARTICIPANT_YEARS, validateParticipantInput } from "@/lib/participant-validation";

// These bounds intentionally mirror the CHECK constraints in
// supabase/migrations/0010_input_validation.sql. If one side changes, the
// other must too — the database is the authority, this is the fast path.
describe("participant input validation", () => {
  const ok = { name: "Aisha Khan", batch: "BTech CSE", year: "2nd year" };

  it("accepts a well-formed participant", () => {
    expect(validateParticipantInput(ok)).toBeNull();
  });

  it("requires a name", () => {
    expect(validateParticipantInput({ ...ok, name: "" })).not.toBeNull();
  });

  it("rejects a whitespace-only name", () => {
    expect(validateParticipantInput({ ...ok, name: "   " })).not.toBeNull();
  });

  it("accepts a name at the 150-character limit", () => {
    expect(validateParticipantInput({ ...ok, name: "a".repeat(150) })).toBeNull();
  });

  it("rejects a name over the 150-character limit", () => {
    expect(validateParticipantInput({ ...ok, name: "a".repeat(151) })).not.toBeNull();
  });

  it("trims before measuring length", () => {
    expect(validateParticipantInput({ ...ok, name: `  ${"a".repeat(150)}  ` })).toBeNull();
  });

  it("treats batch as optional", () => {
    expect(validateParticipantInput({ ...ok, batch: "" })).toBeNull();
  });

  it("rejects a batch over the 100-character limit", () => {
    expect(validateParticipantInput({ ...ok, batch: "b".repeat(101) })).not.toBeNull();
  });

  it("treats year as optional", () => {
    expect(validateParticipantInput({ ...ok, year: "" })).toBeNull();
  });

  // Year is chosen from a list now, so anything off that list — including
  // the graduation years the field used to hold — must be refused.
  it.each(["2028", "1st Year", "1st", "first year", "5th year", " 1st year"])(
    "rejects a year that is not one of the offered options: %j",
    (year) => {
      expect(validateParticipantInput({ ...ok, year })).not.toBeNull();
    },
  );

  it.each(PARTICIPANT_YEARS)("accepts the offered option %j", (year) => {
    expect(validateParticipantInput({ ...ok, year })).toBeNull();
  });

  it("offers exactly first through fourth year", () => {
    expect(PARTICIPANT_YEARS).toEqual(["1st year", "2nd year", "3rd year", "4th year"]);
  });
});
