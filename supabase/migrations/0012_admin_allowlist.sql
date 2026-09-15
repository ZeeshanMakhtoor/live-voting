-- Privilege escalation fix: admin authority was granted to the `authenticated`
-- role as a whole (USING (true)). The anon key is public by design and Supabase
-- enables email signup by default, so anyone could POST /auth/v1/signup, obtain
-- an authenticated JWT, and then read every vote and voter id, read the live
-- leaderboard, and finish the event. Admin is now an explicit allowlist, so the
-- app no longer depends on a dashboard signup toggle staying off.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: unreachable through PostgREST by any role. Only
-- is_admin() (security definer) and the Supabase dashboard can see it.
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_admin() from anon;

insert into public.admin_users (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists participants_admin_all on public.participants;
create policy participants_admin_all on public.participants
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists votes_admin_select on public.votes;
create policy votes_admin_select on public.votes
  for select to authenticated
  using (public.is_admin());
