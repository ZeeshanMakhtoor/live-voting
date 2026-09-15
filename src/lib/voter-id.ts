const STORAGE_KEY = "lcv_voter_id";

/**
 * Persistent anonymous voter id. Random (crypto, not sequential/guessable),
 * stored in localStorage so it survives refreshes for the same browser.
 * This is a convenience identity only — the database never trusts it
 * alone; the unique constraint on votes is the real enforcement.
 *
 * Every browser API used here can fail on a real audience device:
 * localStorage throws outright when site data is blocked (iOS Lockdown
 * Mode, "block all cookies", some in-app browsers), and crypto.randomUUID
 * is missing on non-secure origins and older Safari. None of that should
 * cost someone their vote, so each step degrades instead of throwing: a
 * session-scoped id still satisfies the database's uniqueness rule for as
 * long as the page is open, which is the whole window in which they vote.
 */
let memoryId: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fall through
  }
  // Last resort. Weaker entropy, but voter ids are not a security
  // boundary — they only need to not collide between audience members.
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random()
    .toString(36)
    .slice(2, 12)}`.slice(0, 48);
}

export function getVoterId(): string {
  if (typeof window === "undefined") {
    throw new Error("getVoterId() must be called in the browser");
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // Storage unreadable — fall back to the in-memory id below.
  }

  if (!memoryId) {
    memoryId = randomId();
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, memoryId);
  } catch {
    // Storage unwritable; the in-memory id carries this page session.
  }

  return memoryId;
}
