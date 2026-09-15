import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The database enforces this exact shape (see cast_vote's INVALID_VOTER_ID
// guard), so any id this module can produce must satisfy it or the voter
// simply cannot vote.
const VOTER_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function installStorage(impl: Partial<Storage> = {}) {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
    ...impl,
  } as Storage;
  vi.stubGlobal("window", { localStorage: storage });
  return store;
}

async function freshModule() {
  vi.resetModules();
  return import("@/lib/voter-id");
}

describe("anonymous voter identity", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
      getRandomValues: (a: Uint8Array) => a.fill(7),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces an id the database will accept", async () => {
    installStorage();
    const { getVoterId } = await freshModule();
    expect(getVoterId()).toMatch(VOTER_ID_PATTERN);
  });

  it("is stable across calls so a refresh keeps the same identity", async () => {
    installStorage();
    const { getVoterId } = await freshModule();
    expect(getVoterId()).toBe(getVoterId());
  });

  it("reuses an id already persisted by a previous session", async () => {
    const store = installStorage();
    store.set("lcv_voter_id", "existing-voter-id-0123456789");
    const { getVoterId } = await freshModule();
    expect(getVoterId()).toBe("existing-voter-id-0123456789");
  });

  // Blocked site data (iOS Lockdown Mode, "block all cookies", some in-app
  // browsers) must not cost an audience member their vote.
  it("still yields a usable id when localStorage throws", async () => {
    installStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    const { getVoterId } = await freshModule();
    const id = getVoterId();
    expect(id).toMatch(VOTER_ID_PATTERN);
    expect(getVoterId()).toBe(id);
  });

  it("falls back to getRandomValues when randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    installStorage();
    const { getVoterId } = await freshModule();
    expect(getVoterId()).toMatch(VOTER_ID_PATTERN);
  });

  it("still yields a valid id with no Web Crypto at all", async () => {
    vi.stubGlobal("crypto", undefined);
    installStorage();
    const { getVoterId } = await freshModule();
    expect(getVoterId()).toMatch(VOTER_ID_PATTERN);
  });
});

describe("local voted-participant cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("only reports a vote after it has been recorded", async () => {
    installStorage();
    vi.resetModules();
    const { hasVotedFor, markVotedFor } = await import("@/lib/voted-store");
    expect(hasVotedFor("p1")).toBe(false);
    markVotedFor("p1");
    expect(hasVotedFor("p1")).toBe(true);
    expect(hasVotedFor("p2")).toBe(false);
  });

  it("is idempotent", async () => {
    installStorage();
    vi.resetModules();
    const { hasVotedFor, markVotedFor } = await import("@/lib/voted-store");
    markVotedFor("p1");
    markVotedFor("p1");
    expect(hasVotedFor("p1")).toBe(true);
  });

  it("degrades to 'not voted' on corrupt storage rather than throwing", async () => {
    const store = installStorage();
    store.set("lcv_voted_participants", "{not json");
    vi.resetModules();
    const { hasVotedFor } = await import("@/lib/voted-store");
    expect(hasVotedFor("p1")).toBe(false);
  });
});
