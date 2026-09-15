-- Removed participants (soft-deleted, never had votes — that's the only
-- way admin_remove_participant allows removal) shouldn't clutter the
-- leaderboard or CSV export; they were taken out of the event, not just
-- a low scorer. Skipped/completed/upcoming participants still appear —
-- transparency about who didn't get voted on is intentional.
--
-- CREATE OR REPLACE on the existing function preserves its grants
-- (authenticated only, anon explicitly revoked back in 0004) — no new
-- REVOKE/GRANT needed, unlike creating a fresh function.
create or replace function public.get_leaderboard(p_event_id uuid)
returns table (
  rank int,
  participant_id uuid,
  name text,
  batch text,
  year text,
  display_order int,
  status text,
  vote_count int,
  total_rating_points int,
  average_rating numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    row_number() over (
      order by
        s.average_rating desc nulls last,
        s.vote_count desc,
        s.total_rating_points desc,
        s.display_order asc
    )::int as rank,
    s.participant_id,
    s.name,
    s.batch,
    s.year,
    s.display_order,
    s.status,
    s.vote_count,
    s.total_rating_points,
    s.average_rating
  from public.participant_scores s
  where s.event_id = p_event_id
    and s.status <> 'removed'
  order by
    s.average_rating desc nulls last,
    s.vote_count desc,
    s.total_rating_points desc,
    s.display_order asc;
$$;
