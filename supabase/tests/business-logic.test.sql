-- Business-logic test suite for the voting database.
--
-- Most of this application's critical rules are enforced in Postgres, not in
-- TypeScript, so this is where they are tested. Everything runs inside one
-- transaction that is rolled back at the end: the script leaves no rows,
-- roles, or schema changes behind.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/business-logic.test.sql
--
-- Run it against a local stack (`supabase start`) or a scratch project. It
-- creates a 'live' event, so it will collide with the events_single_live_idx
-- partial unique index if a real event is live on the target database.
--
-- Any failed assertion raises and aborts the run; a clean run prints only
-- PASS lines followed by ALL TESTS PASSED.

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(p_label text, p_condition boolean)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end $$;

-- Asserts that `p_sql` fails with exactly `p_expected` as its message.
create or replace function pg_temp.check_raises(p_label text, p_sql text, p_expected text)
returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
    raise exception 'FAIL  % (expected %, but it succeeded)', p_label, p_expected;
  exception
    when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'FAIL %' then raise; end if;
      if v_msg = p_expected then
        raise notice 'PASS  % -> %', p_label, v_msg;
      else
        raise exception 'FAIL  % (expected %, got %)', p_label, p_expected, v_msg;
      end if;
  end;
end $$;

do $suite$
declare
  ev uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  n int; r record; v_avg numeric;
begin
  -- ── setup ────────────────────────────────────────────────────────────
  insert into public.events(name, status, voting_state)
  values ('TEST EVENT', 'draft', 'not_started') returning id into ev;

  insert into public.participants(event_id, name, batch, year, display_order, status)
  values (ev,'Alpha','BTech CSE','2028',1,'upcoming') returning id into p1;
  insert into public.participants(event_id, name, batch, year, display_order, status)
  values (ev,'Bravo','BTech ECE','2027',2,'upcoming') returning id into p2;
  insert into public.participants(event_id, name, batch, year, display_order, status)
  values (ev,'Charlie',null,null,3,'upcoming') returning id into p3;
  insert into public.participants(event_id, name, batch, year, display_order, status)
  values (ev,'Delta',null,null,4,'upcoming') returning id into p4;

  -- ── input validation (DB constraints, not the client) ────────────────
  perform pg_temp.check_raises('empty participant name rejected',
    format('insert into public.participants(event_id,name,display_order) values (%L,%L,90)', ev, '   '),
    'new row for relation "participants" violates check constraint "participants_name_length"');
  perform pg_temp.check_raises('over-long participant name rejected',
    format('insert into public.participants(event_id,name,display_order) values (%L,%L,91)', ev, repeat('a',151)),
    'new row for relation "participants" violates check constraint "participants_name_length"');
  perform pg_temp.check_raises('malformed year rejected',
    format('insert into public.participants(event_id,name,year,display_order) values (%L,%L,%L,92)', ev, 'X', '28'),
    'new row for relation "participants" violates check constraint "participants_year_format"');

  insert into public.participants(event_id,name,batch,year,display_order)
  values (ev,'NullBatch',null,null,93);
  perform pg_temp.check('batch and year are optional', true);
  delete from public.participants where display_order = 93 and event_id = ev;

  -- ── event state transitions ──────────────────────────────────────────
  perform pg_temp.check_raises('cannot open voting before a participant is active',
    format('select public.admin_open_voting(%L)', ev), 'EVENT_NOT_LIVE');

  perform public.admin_next_participant(ev);
  select active_participant_id into p1 from public.events where id = ev;
  perform pg_temp.check('first Next activates participant 1',
    (select display_order from public.participants where id = p1) = 1);
  perform pg_temp.check('voting starts closed for a newly activated participant',
    (select voting_state from public.events where id = ev) = 'not_started');

  perform pg_temp.check_raises('cannot pause voting that is not open',
    format('select public.admin_pause_voting(%L)', ev), 'VOTING_NOT_OPEN');

  -- ── vote validation ──────────────────────────────────────────────────
  perform pg_temp.check_raises('vote rejected while voting not started',
    format('select public.cast_vote(%L,%L,3::smallint)', p1, 'voter_aaaaaaaaaaaa'), 'VOTING_NOT_OPEN');

  perform public.admin_open_voting(ev);

  perform pg_temp.check_raises('rating 0 rejected',
    format('select public.cast_vote(%L,%L,0::smallint)', p1, 'voter_aaaaaaaaaaaa'), 'INVALID_RATING');
  perform pg_temp.check_raises('rating 6 rejected',
    format('select public.cast_vote(%L,%L,6::smallint)', p1, 'voter_aaaaaaaaaaaa'), 'INVALID_RATING');
  perform pg_temp.check_raises('null rating rejected',
    format('select public.cast_vote(%L,%L,null::smallint)', p1, 'voter_aaaaaaaaaaaa'), 'INVALID_RATING');
  perform pg_temp.check_raises('too-short voter id rejected',
    format('select public.cast_vote(%L,%L,3::smallint)', p1, 'short'), 'INVALID_VOTER_ID');
  perform pg_temp.check_raises('voter id with illegal characters rejected',
    format('select public.cast_vote(%L,%L,3::smallint)', p1, 'bad voter id!!!!!!!!'), 'INVALID_VOTER_ID');

  perform public.cast_vote(p1, 'voter_aaaaaaaaaaaa', 4::smallint);
  perform pg_temp.check('valid vote is recorded',
    (select count(*) from public.votes where participant_id = p1) = 1);

  -- ── duplicate voting ─────────────────────────────────────────────────
  perform pg_temp.check_raises('same voter cannot vote twice',
    format('select public.cast_vote(%L,%L,1::smallint)', p1, 'voter_aaaaaaaaaaaa'), 'ALREADY_VOTED');
  perform pg_temp.check('duplicate attempt did not change the stored rating',
    (select rating from public.votes where participant_id = p1) = 4);
  perform pg_temp.check('duplicate attempt did not create a second row',
    (select count(*) from public.votes where participant_id = p1) = 1);

  -- ── wrong participant / stale client ─────────────────────────────────
  perform pg_temp.check_raises('cannot vote for a participant who is not active',
    format('select public.cast_vote(%L,%L,5::smallint)', p2, 'voter_bbbbbbbbbbbb'), 'PARTICIPANT_NOT_ACTIVE');
  perform pg_temp.check('no vote leaked onto the inactive participant',
    (select count(*) from public.votes where participant_id = p2) = 0);

  -- ── voting closed ────────────────────────────────────────────────────
  perform public.admin_close_voting(ev);
  perform pg_temp.check_raises('no votes accepted once voting is closed',
    format('select public.cast_vote(%L,%L,5::smallint)', p1, 'voter_cccccccccccc'), 'VOTING_NOT_OPEN');
  perform pg_temp.check_raises('deliberately closed voting cannot be reopened',
    format('select public.admin_open_voting(%L)', ev), 'VOTING_ALREADY_CLOSED');

  -- ── participant progression ──────────────────────────────────────────
  perform public.admin_next_participant(ev);
  perform pg_temp.check('previous participant marked completed',
    (select status from public.participants where id = p1) = 'completed');
  perform pg_temp.check('Next advances in display_order',
    (select display_order from public.participants p join public.events e on e.active_participant_id = p.id
     where e.id = ev) = 2);

  perform public.admin_skip_participant(ev, (select active_participant_id from public.events where id = ev));
  perform pg_temp.check('skipping the active participant clears the active slot',
    (select active_participant_id from public.events where id = ev) is null);

  perform public.admin_next_participant(ev);
  perform pg_temp.check('Next skips over a skipped participant',
    (select display_order from public.participants p join public.events e on e.active_participant_id = p.id
     where e.id = ev) = 3);

  -- ── authorization ────────────────────────────────────────────────────
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  perform pg_temp.check_raises('anon cannot finish the event',
    format('select public.admin_finish_event(%L)', ev), 'permission denied for function admin_finish_event');
  perform pg_temp.check_raises('anon cannot advance participants',
    format('select public.admin_next_participant(%L)', ev), 'permission denied for function admin_next_participant');
  perform pg_temp.check_raises('anon cannot read the live leaderboard',
    format('select public.get_leaderboard(%L)', ev), 'permission denied for function get_leaderboard');
  select count(*) into n from public.votes;
  perform pg_temp.check('anon cannot read votes or voter ids', n = 0);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000ff"}';
  select count(*) into n from public.votes;
  perform pg_temp.check('a signed-in non-admin cannot read votes', n = 0);
  select count(*) into n from public.get_leaderboard(ev);
  perform pg_temp.check('a signed-in non-admin gets no leaderboard rows', n = 0);
  reset role;

  -- ── ranking and tie-breaking ─────────────────────────────────────────
  delete from public.votes where event_id = ev;
  update public.participants set status = 'completed' where event_id = ev;

  -- Alpha: 5.0 from only 2 votes. Bravo: 4.8 from 100 votes.
  -- A straight average must rank Alpha first; low turnout is NOT a penalty.
  insert into public.votes(event_id,participant_id,voter_id,rating)
  select ev, p1, 'alpha'||lpad(g::text,14,'0'), 5 from generate_series(1,2) g;
  insert into public.votes(event_id,participant_id,voter_id,rating)
  select ev, p2, 'bravo'||lpad(g::text,14,'0'), case when g <= 80 then 5 else 4 end
  from generate_series(1,100) g;

  select average_rating into v_avg from public.get_leaderboard(ev) where participant_id = p2;
  perform pg_temp.check('Bravo average is 4.8', v_avg = 4.80);

  select participant_id into p4 from public.get_leaderboard(ev) where rank = 1;
  perform pg_temp.check('a 5.0 from 2 votes outranks a 4.8 from 100 (no volume weighting)', p4 = p1);

  -- Tie on average: more votes wins.
  delete from public.votes where event_id = ev;
  insert into public.votes(event_id,participant_id,voter_id,rating)
  select ev, p1, 'ta'||lpad(g::text,14,'0'), 4 from generate_series(1,3) g;
  insert into public.votes(event_id,participant_id,voter_id,rating)
  select ev, p2, 'tb'||lpad(g::text,14,'0'), 4 from generate_series(1,10) g;
  select participant_id into p4 from public.get_leaderboard(ev) where rank = 1;
  perform pg_temp.check('equal averages are broken by vote count', p4 = p2);

  -- Tie on average and vote count: lower display_order wins (deterministic).
  delete from public.votes where event_id = ev;
  insert into public.votes(event_id,participant_id,voter_id,rating)
  select ev, p1, 'ua'||lpad(g::text,14,'0'), 4 from generate_series(1,5) g;
  insert into public.votes(event_id,participant_id,voter_id,rating)
  select ev, p2, 'ub'||lpad(g::text,14,'0'), 4 from generate_series(1,5) g;
  select participant_id into p4 from public.get_leaderboard(ev) where rank = 1;
  perform pg_temp.check('full ties resolve deterministically by display_order', p4 = p1);

  perform pg_temp.check('ranks are dense and start at 1',
    (select count(*) = max(rank) and min(rank) = 1 from public.get_leaderboard(ev)));

  -- A participant with no votes ranks last, not first on a null average.
  perform pg_temp.check('unvoted participants rank below voted ones',
    (select rank from public.get_leaderboard(ev) where participant_id = p3) >
    (select rank from public.get_leaderboard(ev) where participant_id = p1));

  -- Removed participants are excluded entirely.
  update public.participants set status = 'removed' where id = p3;
  perform pg_temp.check('removed participants are excluded from the leaderboard',
    not exists (select 1 from public.get_leaderboard(ev) where participant_id = p3));

  -- ── the audience must never see results ──────────────────────────────
  perform public.admin_finish_event(ev);
  perform pg_temp.check('finishing closes voting and clears the active participant',
    (select status = 'finished' and voting_state = 'closed' and active_participant_id is null
     from public.events where id = ev));
  perform pg_temp.check_raises('no votes accepted after the event is finished',
    format('select public.cast_vote(%L,%L,5::smallint)', p1, 'voter_dddddddddddd'), 'EVENT_NOT_LIVE');

  perform pg_temp.check('no results function is reachable by anyone',
    not exists (select 1 from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
                where ns.nspname = 'public' and pr.proname = 'get_public_top3'));

  -- The only thing anon may call is cast_vote. Anything else that could
  -- expose a standing must be unreachable.
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  perform pg_temp.check_raises('anon cannot read the leaderboard after the event',
    format('select public.get_leaderboard(%L)', ev), 'permission denied for function get_leaderboard');
  select count(*) into n from public.votes;
  perform pg_temp.check('anon still cannot read any vote once finished', n = 0);
  begin
    select count(*) into n from public.participant_scores;
    perform pg_temp.check('anon cannot read participant_scores', n = 0);
  exception when others then
    perform pg_temp.check('anon cannot read participant_scores', true);
  end;
  reset role;

  perform pg_temp.check('exactly one function is anon-callable (cast_vote)',
    (select count(*) from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname = 'public' and pr.prokind = 'f'
       and has_function_privilege('anon', pr.oid, 'EXECUTE')) = 1);

  raise notice '────────────────────────';
  raise notice 'ALL TESTS PASSED';
end $suite$;

rollback;
