/**
 * Client-side mirror of the DB constraints added in
 * supabase/migrations/0010_input_validation.sql. This is a UX
 * convenience only — the database is the authority and enforces the
 * same bounds regardless of what the client sends.
 */
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
  if (values.year && !/^\d{4}$/.test(values.year)) {
    return "Year must be a 4-digit year (e.g. 2028), or left blank.";
  }
  return null;
}
