/**
 * Client-side mirror of the DB constraints in supabase/migrations/. This is
 * a UX convenience only — the database is the authority and enforces the
 * same rules regardless of what the client sends.
 */

/**
 * Year of study, chosen from a fixed list rather than typed. Stored as the
 * label itself, so it needs no translation on the way to the audience
 * screen or the CSV export. The database constrains the column to exactly
 * these values (see the year-of-study migration), so this array and that
 * constraint must be changed together.
 */
export const PARTICIPANT_YEARS = ["1st year", "2nd year", "3rd year", "4th year"] as const;

export type ParticipantYear = (typeof PARTICIPANT_YEARS)[number];

export function isParticipantYear(value: string): value is ParticipantYear {
  return (PARTICIPANT_YEARS as readonly string[]).includes(value);
}

export function validateParticipantInput(values: {
  name: string;
  batch: string;
  year: string;
}): string | null {
  const name = values.name.trim();
  if (name.length < 1 || name.length > 150) {
    return "Name is required and must be 150 characters or fewer.";
  }
  if (values.batch.length > 100) {
    return "Batch must be 100 characters or fewer.";
  }
  if (values.year && !isParticipantYear(values.year)) {
    return "Choose a year of study from the list, or leave it blank.";
  }
  return null;
}
