-- Supports two audience-facing needs from the public voting app:
--
-- 1. Realtime delivery of the live -> finished transition. Supabase
--    Realtime's postgres_changes still applies RLS using the NEW row for
--    UPDATE, so once events_select_live_public only matched status='live',
--    a transition to 'finished' made the row invisible to anon and the
--    change was never delivered — the audience would be stuck on the
--    last participant with no signal the event ended. Extending the
--    policy to also allow 'finished' fixes this. Nothing sensitive is on
--    the events row itself (name + status only matter to anon under this
--    policy); the vote data stays fully locked down.
--
-- 2. A tightly-scoped, opt-in-by-admin-finishing "top 3" reveal. Only
--    once events.status = 'finished': rank + name for the top 3, nothing
--    else (no scores, no vote counts, no other participants). Everything
--    else about results stays authenticated-only exactly as before.

drop policy events_select_live_public on public.events;
create policy events_select_public on public.events
  for select
  to anon
  using (status in ('live', 'finished'));

create function public.get_public_top3(p_event_id uuid)
returns table (rank int, name text)
language sql
stable
security definer
set search_path = public
as $$
  select l.rank, l.name
  from public.get_leaderboard(p_event_id) l
  join public.events e on e.id = p_event_id
  where e.status = 'finished'
  order by l.rank
  limit 3;
$$;

revoke all on function public.get_public_top3(uuid) from public;
grant execute on function public.get_public_top3(uuid) to anon, authenticated;
