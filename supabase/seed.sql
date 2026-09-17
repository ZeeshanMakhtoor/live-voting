-- Local development seed data only.
--
-- Convention: the Supabase CLI runs this file automatically on
-- `supabase db reset` for local dev, and never on `supabase db push` /
-- remote migrations — it is not part of the schema and is never applied
-- to a hosted project by anything in this repo. No votes are seeded:
-- fake vote rows could too easily be mistaken for real event data.

insert into public.events (name, status, voting_state)
values ('Literary Club — Dev Event', 'draft', 'not_started');

insert into public.participants (event_id, name, batch, year, display_order, status)
select id, name, batch, year, display_order, 'upcoming'
from public.events
cross join (
  values
    ('Aisha Khan', 'BTech CSE', '1st year', 1),
    ('Rahul Verma', 'BTech CSE', '2nd year', 2),
    ('Zoya Ahmed', 'BTech ECE', '3rd year', 3),
    ('Daniel Lee', 'BTech ECE', '4th year', 4)
) as p(name, batch, year, display_order)
where public.events.name = 'Literary Club — Dev Event';
