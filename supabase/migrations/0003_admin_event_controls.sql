-- Admin event-control RPCs: the only sanctioned way to move an event/
-- participant through its lifecycle. Each one is a single function call,
-- so every state change it makes is one transaction — there is no
-- window where a client could observe (or a concurrent vote could land
-- against) a half-applied transition.
--
-- These run SECURITY INVOKER, not DEFINER: the authenticated admin already
-- has full RLS access to events/participants (see 0001's
-- events_admin_all / participants_admin_all policies), so these functions
-- add atomicity and business-rule validation, not elevated privilege.
-- EXECUTE is still restricted to authenticated so anon can't even attempt
-- the call (fails at the grant, before any row is touched).
--
-- The partial unique index participants_single_active_per_event_idx
-- (from 0001) is the hard backstop: even if one of these functions had a
-- bug, the database itself refuses to ever hold two active participants
-- for the same event.
--
-- Every failure raises a short machine-readable message: EVENT_NOT_FOUND,
-- EVENT_FINISHED, PARTICIPANT_NOT_FOUND, PARTICIPANT_REMOVED,
-- EVENT_NOT_LIVE, NO_ACTIVE_PARTICIPANT, VOTING_NOT_OPEN, VOTING_NOT_PAUSED,
-- NO_MORE_PARTICIPANTS.

-- ---------------------------------------------------------------------------
-- admin_start_participant — select a specific participant as the active one.
-- Also promotes the event from 'draft' to 'live' on first use. Demotes
-- whichever participant was previously active (if any) to 'completed'.
-- ---------------------------------------------------------------------------
create function public.admin_start_participant(p_event_id uuid, p_participant_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_status text;
  v_participant_status text;
begin
  select status into v_event_status from public.events where id = p_event_id for update;
  if v_event_status is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event_status = 'finished' then
    raise exception 'EVENT_FINISHED';
  end if;

  select status into v_participant_status
  from public.participants
  where id = p_participant_id and event_id = p_event_id
  for update;
  if v_participant_status is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;
  if v_participant_status = 'removed' then
    raise exception 'PARTICIPANT_REMOVED';
  end if;

  update public.participants
     set status = 'completed'
   where event_id = p_event_id
     and status = 'active'
     and id <> p_participant_id;

  update public.participants
     set status = 'active'
   where id = p_participant_id;

  update public.events
     set status = 'live',
         active_participant_id = p_participant_id,
         voting_state = 'not_started'
   where id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_next_participant — complete the current participant and advance to
-- the next one by display_order. Raises NO_MORE_PARTICIPANTS at the end of
-- the list; the admin then calls admin_finish_event explicitly.
-- ---------------------------------------------------------------------------
create function public.admin_next_participant(p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_status text;
  v_current_id uuid;
  v_current_order int;
  v_next_id uuid;
begin
  select status, active_participant_id into v_event_status, v_current_id
  from public.events where id = p_event_id for update;
  if v_event_status is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event_status = 'finished' then
    raise exception 'EVENT_FINISHED';
  end if;

  if v_current_id is not null then
    select display_order into v_current_order from public.participants where id = v_current_id;
    update public.participants set status = 'completed' where id = v_current_id;
  else
    v_current_order := -1;
  end if;

  select id into v_next_id
  from public.participants
  where event_id = p_event_id
    and display_order > v_current_order
    and status not in ('removed', 'skipped', 'completed')
  order by display_order asc
  limit 1
  for update;

  if v_next_id is null then
    raise exception 'NO_MORE_PARTICIPANTS';
  end if;

  update public.participants set status = 'active' where id = v_next_id;
  update public.events
     set status = 'live',
         active_participant_id = v_next_id,
         voting_state = 'not_started'
   where id = p_event_id;

  return v_next_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_skip_participant — mark a participant skipped. If it was the
-- active one, clears the event's active participant (admin must
-- explicitly start/advance to someone else afterward).
-- ---------------------------------------------------------------------------
create function public.admin_skip_participant(p_event_id uuid, p_participant_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_id uuid;
begin
  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select active_participant_id into v_active_id from public.events where id = p_event_id;

  perform 1 from public.participants
  where id = p_participant_id and event_id = p_event_id
  for update;
  if not found then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  update public.participants set status = 'skipped' where id = p_participant_id;

  if v_active_id = p_participant_id then
    update public.events
       set active_participant_id = null,
           voting_state = 'not_started'
     where id = p_event_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_open_voting / admin_pause_voting / admin_close_voting — control
-- whether the current active participant can receive votes right now.
-- Each enforces the one legal predecessor state rather than allowing any
-- transition, so the state machine can't be driven somewhere nonsensical.
-- ---------------------------------------------------------------------------
create function public.admin_open_voting(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_active_id uuid;
begin
  select status, active_participant_id into v_status, v_active_id
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

  update public.events set voting_state = 'open' where id = p_event_id;
end;
$$;

create function public.admin_pause_voting(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_voting_state text;
begin
  select voting_state into v_voting_state from public.events where id = p_event_id for update;
  if v_voting_state is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_voting_state <> 'open' then
    raise exception 'VOTING_NOT_OPEN';
  end if;

  update public.events set voting_state = 'paused' where id = p_event_id;
end;
$$;

create function public.admin_close_voting(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_voting_state text;
begin
  select voting_state into v_voting_state from public.events where id = p_event_id for update;
  if v_voting_state is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_voting_state not in ('open', 'paused') then
    raise exception 'VOTING_NOT_OPEN';
  end if;

  update public.events set voting_state = 'closed' where id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_finish_event — end the event. Completes whoever is still active
-- and closes voting; does not delete or alter any historical vote.
-- ---------------------------------------------------------------------------
create function public.admin_finish_event(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_id uuid;
begin
  select active_participant_id into v_active_id
  from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_active_id is not null then
    update public.participants set status = 'completed' where id = v_active_id;
  end if;

  update public.events
     set status = 'finished',
         active_participant_id = null,
         voting_state = 'closed'
   where id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated (admin) only. Anon cannot even attempt these calls.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_start_participant(uuid, uuid) from public;
revoke all on function public.admin_next_participant(uuid) from public;
revoke all on function public.admin_skip_participant(uuid, uuid) from public;
revoke all on function public.admin_open_voting(uuid) from public;
revoke all on function public.admin_pause_voting(uuid) from public;
revoke all on function public.admin_close_voting(uuid) from public;
revoke all on function public.admin_finish_event(uuid) from public;

grant execute on function public.admin_start_participant(uuid, uuid) to authenticated;
grant execute on function public.admin_next_participant(uuid) to authenticated;
grant execute on function public.admin_skip_participant(uuid, uuid) to authenticated;
grant execute on function public.admin_open_voting(uuid) to authenticated;
grant execute on function public.admin_pause_voting(uuid) to authenticated;
grant execute on function public.admin_close_voting(uuid) to authenticated;
grant execute on function public.admin_finish_event(uuid) to authenticated;
