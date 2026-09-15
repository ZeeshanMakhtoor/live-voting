import { describe, expect, it } from "vitest";
import { validateParticipantInput } from "@/lib/participant-validation";

// These bounds intentionally mirror the CHECK constraints in
// supabase/migrations/0010_input_validation.sql. If one side changes, the
// other must too — the database is the authority, this is the fast path.
describe("participant input validation", () => {
  const ok = { name: "Aisha Khan", batch: "BTech CSE", year: "2028" };

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

  it.each(["28", "20281", "20a8", "two thousand", "2028 ", "-123"])(
    "rejects malformed year %j",
    (year) => {
      expect(validateParticipantInput({ ...ok, year })).not.toBeNull();
    },
  );

  it("accepts a 4-digit year", () => {
    expect(validateParticipantInput({ ...ok, year: "2028" })).toBeNull();
  });
});
