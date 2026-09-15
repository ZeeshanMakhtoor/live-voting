-- Input validation was previously enforced only for rating (1-5) and
-- voter_id (format). Name/batch/year had no length or format bounds at
-- all — a client bug or a malicious anon-authenticated... no, these are
-- admin-only writes, but a compromised/careless admin session (or a
-- future code path) could still write unbounded text. Add DB-level
-- bounds so the database stays the authority regardless of what the
-- client validates.
--
-- batch stays optional (nullable) — not every event cares about it.
-- year, if present, must be a 4-digit year (matches the product's own
-- example: "2028"). Both bounds are lenient on purpose: this validates
-- shape, not content — no need to guess every legitimate batch label.

alter table public.participants
  add constraint participants_name_length check (char_length(btrim(name)) between 1 and 150),
  add constraint participants_batch_length check (batch is null or char_length(batch) <= 100),
  add constraint participants_year_format check (year is null or year ~ '^\d{4}$');

alter table public.events
  add constraint events_name_length check (char_length(btrim(name)) between 1 and 200);
