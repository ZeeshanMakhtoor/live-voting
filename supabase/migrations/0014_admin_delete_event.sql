-- Deleting an event is the only destructive operation in the system: it
-- cascades to every participant and every vote, and cannot be undone.
-- It exists so rehearsal events can be cleared out before the real one.
--
-- A live event can never be deleted. That guard lives here rather than in
-- the dashboard, because a UI-only check is no check at all — the anon key
-- is public and admin RPCs are reachable directly. Finish the event first
-- if you genuinely mean to remove it.

create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_status text;
  v_deleted int;
begin
  select status into v_status
  from public.events
  where id = p_event_id
  for update;

  -- Null also covers a non-admin caller, whose RLS policy hides every row,
  -- so this fails closed rather than leaking whether the event exists.
  if v_status is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_status = 'live' then
    raise exception 'EVENT_IS_LIVE';
  end if;

  delete from public.events where id = p_event_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'EVENT_NOT_FOUND';
  end if;
end;
$$;

revoke execute on function public.admin_delete_event(uuid) from public, anon;
