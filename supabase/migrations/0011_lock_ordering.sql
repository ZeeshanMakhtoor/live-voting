-- Consistent lock ordering: event, then participant.
--
-- cast_vote previously locked participant -> event while every admin_*
-- function locks event -> participant. Under live load (an admin pressing
-- "Next" while the audience is submitting) that inversion can deadlock:
-- Postgres aborts one side with 40P01, surfacing as an opaque error to a
-- voter or to the admin mid-event.
--
-- The vote path also only ever *reads* event/participant state, so it takes
-- FOR SHARE rather than FOR UPDATE. FOR UPDATE forced all concurrent voters
-- to serialise behind the single event row; FOR SHARE lets them proceed in
-- parallel while still blocking against (and being blocked by) the admin
-- FOR UPDATE, which is what actually needs to be mutually exclusive.

create or replace function public.cast_vote(
  p_participant_id uuid,
  p_voter_id text,
  p_rating smallint
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event_id uuid;
  v_event_status text;
  v_voting_state text;
  v_participant_status text;
  v_active_participant_id uuid;
  v_vote_id uuid;
begin
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'INVALID_RATING';
  end if;

  if p_voter_id is null or p_voter_id !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'INVALID_VOTER_ID';
  end if;

  -- Unlocked, purely to resolve which event row to lock first. Nothing is
  -- decided from this read: every value the authorisation checks below use
  -- is re-read under a lock.
  select p.event_id into v_event_id
  from public.participants p
  where p.id = p_participant_id;

  if v_event_id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  select e.status, e.voting_state, e.active_participant_id
    into v_event_status, v_voting_state, v_active_participant_id
  from public.events e
  where e.id = v_event_id
  for share of e;

  select p.status into v_participant_status
  from public.participants p
  where p.id = p_participant_id and p.event_id = v_event_id
  for share of p;

  if v_participant_status is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  if v_event_status is distinct from 'live' then
    raise exception 'EVENT_NOT_LIVE';
  end if;

  if v_active_participant_id is distinct from p_participant_id
     or v_participant_status is distinct from 'active' then
    raise exception 'PARTICIPANT_NOT_ACTIVE';
  end if;

  if v_voting_state is distinct from 'open' then
    raise exception 'VOTING_NOT_OPEN';
  end if;

  begin
    insert into public.votes (event_id, participant_id, voter_id, rating)
    values (v_event_id, p_participant_id, p_voter_id, p_rating)
    returning id into v_vote_id;
  exception
    when unique_violation then
      raise exception 'ALREADY_VOTED';
  end;

  return v_vote_id;
end;
$$;

-- Swapping took no event lock and locked the two participant rows in
-- argument order, so two swaps issued with mirrored arguments could
-- deadlock, and two concurrent swaps could collide on the display_order=-1
-- scratch value against participants_event_id_display_order_key. Locking
-- the event first serialises swaps and matches the ordering above.
create or replace function public.admin_swap_participant_order(
  p_event_id uuid,
  p_participant_id_a uuid,
  p_participant_id_b uuid
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_order_a int;
  v_order_b int;
begin
  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select display_order into v_order_a
  from public.participants where id = p_participant_id_a and event_id = p_event_id
  for update;
  select display_order into v_order_b
  from public.participants where id = p_participant_id_b and event_id = p_event_id
  for update;

  if v_order_a is null or v_order_b is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  update public.participants set display_order = -1 where id = p_participant_id_a;
  update public.participants set display_order = v_order_a where id = p_participant_id_b;
  update public.participants set display_order = v_order_b where id = p_participant_id_a;
end;
$$;

revoke execute on function public.admin_swap_participant_order(uuid, uuid, uuid) from anon;
