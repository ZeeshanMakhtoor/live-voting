-- Whether THIS voter has already voted for THIS performer.
--
-- The audience app used to decide that from localStorage alone, so a phone
-- that lost its local record — cleared site data, a different in-app
-- browser, an OS storage eviction — was offered the voting form again for a
-- performer it had already voted for. The vote itself was still safe (the
-- unique index rejects it), but the screen was wrong and confusing. This
-- lets the client ask the database rather than guess.
--
-- Security definer because anon has no read access to votes at all and must
-- not gain any: this returns one boolean for one exact (participant, voter)
-- pair. No counts, no standings, no other voter's activity. Voter ids are
-- random 36-character values, so they cannot be enumerated.
--
-- Indexed by votes_participant_idx; at 5,000 votes this plans as a bitmap
-- index scan and executes in well under a millisecond.
create or replace function public.has_voted(p_participant_id uuid, p_voter_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.votes v
    where v.participant_id = p_participant_id
      and v.voter_id = p_voter_id
  );
$$;

revoke execute on function public.has_voted(uuid, text) from public;
grant execute on function public.has_voted(uuid, text) to anon, authenticated;
