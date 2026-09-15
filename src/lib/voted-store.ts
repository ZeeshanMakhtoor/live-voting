const STORAGE_KEY = "lcv_voted_participants";

/**
 * Local convenience cache of which participants this browser has
 * confirmed a vote for, so a refresh doesn't show the rating form again.
 * This is purely a UX shortcut — it is only ever set after the database
 * itself confirms a vote (a successful or ALREADY_VOTED response from
 * cast_vote), never optimistically before that. If it's ever missing
 * (cleared storage, different device), cast_vote still enforces the
 * real rule and returns ALREADY_VOTED, which this same cache then
 * records.
 */
function readAll(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasVotedFor(participantId: string): boolean {
  return readAll().includes(participantId);
}

export function markVotedFor(participantId: string): void {
  if (typeof window === "undefined") return;
  const current = readAll();
  if (current.includes(participantId)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, participantId]));
  } catch {
    // Storage full or unavailable — not fatal, just loses the shortcut.
  }
}
