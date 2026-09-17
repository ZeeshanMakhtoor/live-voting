-- Year is now a year of study chosen from a fixed list, not a typed
-- graduation year. The label itself is stored, so nothing has to translate
-- it on the way to the audience screen or the CSV export.
--
-- Existing values are graduation years ("2028"). There is no honest mapping
-- from those to a year of study without knowing the academic calendar, so
-- anything outside the new list is cleared rather than guessed at. Year has
-- always been optional, so a cleared value is a state the app already
-- handles: it simply shows nothing.
--
-- This list is mirrored in PARTICIPANT_YEARS (src/lib/participant-validation.ts);
-- the two must change together.

alter table public.participants drop constraint if exists participants_year_format;

update public.participants
   set year = null
 where year is not null
   and year not in ('1st year', '2nd year', '3rd year', '4th year');

alter table public.participants
  add constraint participants_year_format
  check (year is null or year in ('1st year', '2nd year', '3rd year', '4th year'));
