-- Additional admin RPCs needed by the admin dashboard, plus enabling
-- Realtime on participants/votes so the dashboard updates live (events
-- was already enabled in 0006).
--
-- Same posture as 0003: SECURITY INVOKER (the authenticated admin
-- already has full RLS access to events/participants; these add
-- atomicity + validated transitions, not elevated privilege), EXECUTE
-- restricted to authenticated, and — learned the hard way in 0004 —
-- that restriction must explicitly name anon, since Supabase grants
-- EXECUTE on new functions directly to anon/authenticated/service_role
-- and a bare "revoke ... from public" does not touch that.

-- ---------------------------------------------------------------------------
-- admin_previous_participant — step back to the nearest earlier
-- participant by display_order (excluding only 'removed'). Unlike
-- admin_next_participant, this deliberately CAN revisit a participant
-- that was skipped or already completed — it's the admin's manual
-- "go back" override, not the automatic forward sequence.
-- ---------------------------------------------------------------------------
create function public.admin_previous_participant(p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_status text;
  v_current_id uuid;
  v_current_order int;
  v_prev_id uuid;
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
    update public.participants set status = 'upcoming' where id = v_current_id;
  else
    select coalesce(max(display_order), 0) + 1 into v_current_order
    from public.participants where event_id = p_event_id;
  end if;

  select id into v_prev_id
  from public.participants
  where event_id = p_event_id
    and display_order < v_current_order
    and status <> 'removed'
  order by display_order desc
  limit 1
  for update;

  if v_prev_id is null then
    raise exception 'NO_PREVIOUS_PARTICIPANT';
  end if;

  update public.participants set status = 'active' where id = v_prev_id;
  update public.events
     set status = 'live',
         active_participant_id = v_prev_id,
         voting_state = 'not_started'
   where id = p_event_id;

  return v_prev_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_remove_participant — soft-remove (status='removed'), never a
-- DELETE, so historical event records are always preserved. Refuses to
-- remove a participant who already has real votes recorded against
-- them ("remove before voting begins" from the product brief) rather
-- than silently orphaning history. Clears the event's active
-- participant if it was the one removed, so the audience/admin never
-- keep pointing at a removed participant.
-- ---------------------------------------------------------------------------
create function public.admin_remove_participant(p_event_id uuid, p_participant_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_id uuid;
  v_vote_count int;
begin
  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  perform 1 from public.participants
  where id = p_participant_id and event_id = p_event_id
  for update;
  if not found then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  select count(*) into v_vote_count from public.votes where participant_id = p_participant_id;
  if v_vote_count > 0 then
    raise exception 'PARTICIPANT_HAS_VOTES';
  end if;

  update public.participants set status = 'removed' where id = p_participant_id;

  select active_participant_id into v_active_id from public.events where id = p_event_id;
  if v_active_id = p_participant_id then
    update public.events
       set active_participant_id = null,
           voting_state = 'not_started'
     where id = p_event_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_swap_participant_order — move a participant up/down the running
-- order by swapping display_order with its neighbor. display_order has
-- a unique(event_id, display_order) constraint, so a direct two-row
-- swap risks a transient collision depending on row-write order; this
-- routes one row through a scratch value outside the valid range first,
-- which is always safe regardless of write order.
-- ---------------------------------------------------------------------------
create function public.admin_swap_participant_order(
  p_event_id uuid,
  p_participant_id_a uuid,
  p_participant_id_b uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_a int;
  v_order_b int;
begin
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

revoke all on function public.admin_previous_participant(uuid) from public, anon;
revoke all on function public.admin_remove_participant(uuid, uuid) from public, anon;
revoke all on function public.admin_swap_participant_order(uuid, uuid, uuid) from public, anon;

grant execute on function public.admin_previous_participant(uuid) to authenticated;
grant execute on function public.admin_remove_participant(uuid, uuid) to authenticated;
grant execute on function public.admin_swap_participant_order(uuid, uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.votes;
