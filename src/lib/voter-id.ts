const STORAGE_KEY = "lcv_voter_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

/**
 * Persistent anonymous voter id. Random (crypto, not sequential/guessable),
 * and written to BOTH localStorage and a cookie.
 *
 * Two stores rather than one because browsers evict them independently:
 * "clear site data" in some browsers drops localStorage but not cookies,
 * iOS evicts script-writable storage on its own schedule, and an in-app
 * browser may expose one and not the other. Losing this id means the voter
 * is treated as a new person and is offered a vote they already cast, so
 * it is worth reading from either and writing to both.
 *
 * This is still a convenience identity, never a trust boundary — the unique
 * index on votes is what actually enforces one vote per voter.
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

/** Only ids this app could have produced; anything else is treated as absent. */
const VALID = /^[A-Za-z0-9_-]{16,64}$/;

function readLocalStorage(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && VALID.test(v) ? v : null;
  } catch {
    return null;
  }
}

function readCookie(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)lcv_voter_id=([^;]*)/);
    if (!match) return null;
    const raw = match[1];
    if (!raw) return null;
    const v = decodeURIComponent(raw);
    return VALID.test(v) ? v : null;
  } catch {
    return null;
  }
}

function persist(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unwritable; the cookie below may still carry it.
  }
  try {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(id)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
  } catch {
    // Cookies unwritable; localStorage above may still carry it.
  }
}

export function getVoterId(): string {
  if (typeof window === "undefined") {
    throw new Error("getVoterId() must be called in the browser");
  }

  const existing = readLocalStorage() ?? readCookie();
  if (existing) {
    // Re-persist so a store that lost it is repopulated from the one that
    // kept it, instead of the id surviving in only one place.
    persist(existing);
    return existing;
  }

  if (!memoryId) {
    memoryId = randomId();
  }
  persist(memoryId);
  return memoryId;
}
