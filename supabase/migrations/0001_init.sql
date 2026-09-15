-- Literary Club Live Voting — initial schema
--
-- Design principles enforced here (see project brief):
--   * The database is the source of truth, not the client.
--   * Exactly one vote per (event, participant, voter), enforced by a
--     unique constraint, not by client-side checks.
--   * Ranking uses AVERAGE rating, computed in SQL, not accumulated in JS.
--   * Audience RLS exposes only the active event + active participant's
--     public fields, and allows INSERT-only, no-read access to votes,
--     mediated by a SECURITY DEFINER function so it can also validate
--     that voting is actually open for that participant right now.
--   * Admin (authenticated) can manage events/participants but has no
--     UPDATE/DELETE policy on votes at all — history is immutable.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  active_participant_id uuid,
  voting_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one event may be 'active' at a time.
create unique index events_single_active_idx on public.events ((status = 'active')) where status = 'active';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  batch text,
  year text,
  display_order integer not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'active', 'completed', 'skipped', 'removed')),
  created_at timestamptz not null default now(),
  unique (event_id, display_order)
);

-- Only one participant per event may be 'active' at a time.
create unique index participants_single_active_per_event_idx
  on public.participants (event_id)
  where status = 'active';

alter table public.events
  add constraint events_active_participant_fk
  foreign key (active_participant_id) references public.participants (id) on delete set null;

-- ---------------------------------------------------------------------------
-- votes
-- ---------------------------------------------------------------------------
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  -- Client-generated anonymous voter id. Bounded length/charset only;
  -- it is never treated as a trusted identity, just a dedup key.
  voter_id text not null check (voter_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (event_id, participant_id, voter_id)
);

create index votes_participant_idx on public.votes (participant_id);

-- ---------------------------------------------------------------------------
-- results (admin-only view; average, not total votes, drives ranking)
-- ---------------------------------------------------------------------------
create view public.participant_results as
select
  p.id as participant_id,
  p.event_id,
  p.name,
  p.batch,
  p.year,
  p.display_order,
  p.status,
  count(v.id)::int as vote_count,
  avg(v.rating)::numeric(4, 2) as average_rating
from public.participants p
left join public.votes v on v.participant_id = p.id
group by p.id, p.event_id, p.name, p.batch, p.year, p.display_order, p.status;

-- ---------------------------------------------------------------------------
-- cast_vote — the only way anonymous audience members write a vote.
--
-- SECURITY DEFINER so it can validate against events/participants (which
-- anon cannot read in full) while anon still cannot INSERT into votes
-- directly. Concurrency-safe: correctness relies on the unique constraint
-- on votes, not on any check-then-insert race in application code.
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(
  p_participant_id uuid,
  p_voter_id text,
  p_rating smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_voting_open boolean;
begin
  if p_rating not between 1 and 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  select e.id, e.voting_open
    into v_event_id, v_voting_open
  from public.participants p
  join public.events e on e.id = p.event_id
  where p.id = p_participant_id
    and p.status = 'active'
    and e.status = 'active'
    and e.active_participant_id = p_participant_id
  for share of e, p;

  if v_event_id is null then
    raise exception 'this participant is not currently open for voting';
  end if;

  if not v_voting_open then
    raise exception 'voting is closed for this participant';
  end if;

  insert into public.votes (event_id, participant_id, voter_id, rating)
  values (v_event_id, p_participant_id, p_voter_id, p_rating);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.votes enable row level security;

-- events: anon may only read the single active event's public fields.
-- (No column-level split is needed here — every column on this row is
-- already safe for the audience to see.)
create policy events_select_active_public on public.events
  for select
  to anon
  using (status = 'active');

create policy events_admin_all on public.events
  for all
  to authenticated
  using (true)
  with check (true);

-- participants: anon may only read participants belonging to the active
-- event (needed so the audience UI can render the current name/batch/year).
create policy participants_select_public on public.participants
  for select
  to anon
  using (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.status = 'active'
    )
  );

create policy participants_admin_all on public.participants
  for all
  to authenticated
  using (true)
  with check (true);

-- votes: no direct anon access at all (insert happens via cast_vote, which
-- runs as the function owner). Admin can read for results, but there is
-- deliberately no UPDATE or DELETE policy for anyone — votes are immutable.
create policy votes_admin_select on public.votes
  for select
  to authenticated
  using (true);

grant execute on function public.cast_vote(uuid, text, smallint) to anon;
