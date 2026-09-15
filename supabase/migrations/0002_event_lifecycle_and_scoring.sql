-- Event lifecycle rename, explicit voting_state, participant.updated_at,
-- a hardened atomic cast_vote, and the authoritative scoring view/RPC.
--
-- Why voting_state is a separate column from events.status (not derived
-- from participants.status, and not folded into events.status itself):
--   * events.status is the EVENT's lifecycle: draft -> live -> finished.
--   * voting_state is whether the CURRENT active participant can receive
--     votes right now: not_started -> open -> paused -> closed.
--   These are genuinely independent axes (an event can be 'live' with
--   voting 'paused' while the admin talks between participants), so
--   collapsing them into one column would force fake states like
--   'live_but_paused'. Keeping them separate avoids duplicating state.

-- ---------------------------------------------------------------------------
-- 1. events.status: draft/active/completed -> draft/live/finished
-- ---------------------------------------------------------------------------
alter table public.events drop constraint events_status_check;
update public.events set status = 'live' where status = 'active';
update public.events set status = 'finished' where status = 'completed';
alter table public.events
  add constraint events_status_check check (status in ('draft', 'live', 'finished'));

drop index if exists events_single_active_idx;
create unique index events_single_live_idx on public.events ((status = 'live')) where status = 'live';

-- ---------------------------------------------------------------------------
-- 2. voting_state replaces the boolean voting_open
-- ---------------------------------------------------------------------------
alter table public.events add column voting_state text;
update public.events set voting_state = case when voting_open then 'open' else 'not_started' end;
alter table public.events alter column voting_state set not null;
alter table public.events alter column voting_state set default 'not_started';
alter table public.events
  add constraint events_voting_state_check
  check (voting_state in ('not_started', 'open', 'paused', 'closed'));
alter table public.events drop column voting_open;

-- ---------------------------------------------------------------------------
-- 3. participants.updated_at (created_at already existed)
-- ---------------------------------------------------------------------------
alter table public.participants add column updated_at timestamptz not null default now();

create trigger participants_set_updated_at
  before update on public.participants
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS policies referencing the old 'active' status value
-- ---------------------------------------------------------------------------
drop policy events_select_active_public on public.events;
create policy events_select_live_public on public.events
  for select
  to anon
  using (status = 'live');

drop policy participants_select_public on public.participants;
create policy participants_select_public on public.participants
  for select
  to anon
  using (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.status = 'live'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. cast_vote — atomic, fully validated vote submission.
--
-- Every failure mode raises a short machine-readable message (no leading
-- prose) so the client can map it to a clean, specific error instead of
-- parsing free text: EVENT_NOT_FOUND, EVENT_NOT_LIVE, PARTICIPANT_NOT_FOUND,
-- PARTICIPANT_NOT_ACTIVE, VOTING_NOT_OPEN, INVALID_RATING, INVALID_VOTER_ID,
-- ALREADY_VOTED.
--
-- Locks the event row (FOR UPDATE) before reading voting_state/
-- active_participant_id, so a vote can never straddle an admin state
-- change (e.g. land after the admin has closed voting) — the insert and
-- the validation it depends on happen inside one serialized transaction.
-- Duplicate-vote races are additionally guaranteed safe by the unique
-- index on votes(event_id, participant_id, voter_id): whichever of two
-- concurrent inserts commits first wins, the other always gets
-- unique_violation, with no window for both to succeed.
-- ---------------------------------------------------------------------------
drop function if exists public.cast_vote(uuid, text, smallint);

create function public.cast_vote(
  p_participant_id uuid,
  p_voter_id text,
  p_rating smallint
)
returns uuid
language plpgsql
security definer
set search_path = public
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

  select p.event_id, p.status into v_event_id, v_participant_status
  from public.participants p
  where p.id = p_participant_id
  for update of p;

  if v_event_id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  select e.status, e.voting_state, e.active_participant_id
    into v_event_status, v_voting_state, v_active_participant_id
  from public.events e
  where e.id = v_event_id
  for update of e;

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

revoke all on function public.cast_vote(uuid, text, smallint) from public;
grant execute on function public.cast_vote(uuid, text, smallint) to anon;

-- ---------------------------------------------------------------------------
-- 6. Scoring — authoritative, computed from votes, never a stored total.
--
-- participant_scores is the raw per-participant aggregation. get_leaderboard
-- is the canonical, deterministically-ordered read: it exists so every
-- caller gets identical tie-break behavior instead of each re-implementing
-- ORDER BY. Tie-break chain (documented here, the one source of truth):
--   1. higher average_rating
--   2. higher vote_count
--   3. higher total_rating_points
--   4. lower display_order (stable, deterministic final tiebreaker)
-- Both are authenticated-only: audience must never see results, finalized
-- or not.
-- ---------------------------------------------------------------------------
drop view if exists public.participant_results;

create view public.participant_scores as
select
  p.id as participant_id,
  p.event_id,
  p.name,
  p.batch,
  p.year,
  p.display_order,
  p.status,
  count(v.id)::int as vote_count,
  coalesce(sum(v.rating), 0)::int as total_rating_points,
  avg(v.rating)::numeric(4, 2) as average_rating
from public.participants p
left join public.votes v on v.participant_id = p.id
group by p.id, p.event_id, p.name, p.batch, p.year, p.display_order, p.status;

alter view public.participant_scores set (security_invoker = on);
revoke all on public.participant_scores from public, anon;
grant select on public.participant_scores to authenticated;

create function public.get_leaderboard(p_event_id uuid)
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
  order by
    s.average_rating desc nulls last,
    s.vote_count desc,
    s.total_rating_points desc,
    s.display_order asc;
$$;

revoke all on function public.get_leaderboard(uuid) from public;
grant execute on function public.get_leaderboard(uuid) to authenticated;
