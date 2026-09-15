-- admin_open_voting previously allowed transitioning from ANY voting_state
-- to 'open', including 'closed' — meaning "resume" could accidentally
-- reopen a round the admin had deliberately closed. Closed is meant to be
-- terminal for that participant: the fix is to move to another
-- participant (which resets voting_state to not_started), not reopen.
create or replace function public.admin_open_voting(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_active_id uuid;
  v_voting_state text;
begin
  select status, active_participant_id, voting_state into v_status, v_active_id, v_voting_state
  from public.events where id = p_event_id for update;
  if v_status is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_status <> 'live' then
    raise exception 'EVENT_NOT_LIVE';
  end if;
  if v_active_id is null then
    raise exception 'NO_ACTIVE_PARTICIPANT';
  end if;
  if v_voting_state = 'closed' then
    raise exception 'VOTING_ALREADY_CLOSED';
  end if;

  update public.events set voting_state = 'open' where id = p_event_id;
end;
$$;
