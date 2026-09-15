const STORAGE_KEY = "lcv_voter_id";

/**
 * Persistent anonymous voter id. Random (crypto, not sequential/guessable),
 * stored in localStorage so it survives refreshes for the same browser.
 * This is a convenience identity only — the database never trusts it
 * alone; the unique constraint on votes is the real enforcement.
 */
export function getVoterId(): string {
  if (typeof window === "undefined") {
    throw new Error("getVoterId() must be called in the browser");
  }

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, id);
  return id;
}
