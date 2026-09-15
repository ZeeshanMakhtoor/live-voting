-- Fix a real privilege leak found during integrity testing.
--
-- Supabase automatically grants EXECUTE on every new function in the
-- public schema directly to anon/authenticated/service_role (not via the
-- PUBLIC pseudo-role), independent of any default-privilege ALTER. The
-- previous migrations only revoked from PUBLIC, which does not remove
-- that direct grant. As a result anon could call every admin_* RPC and
-- get_leaderboard — confirmed live: `set role anon; select
-- admin_finish_event(...)` executed instead of failing on the grant, and
-- anon could call get_leaderboard (leaderboard data must never reach the
-- audience, finalized or not).
--
-- Fix: revoke EXECUTE from anon explicitly on every admin-only function
-- and on get_leaderboard, verified against pg_proc.proacl this time
-- rather than assumed from the REVOKE ALL FROM PUBLIC statement alone.

revoke execute on function public.admin_start_participant(uuid, uuid) from anon;
revoke execute on function public.admin_next_participant(uuid) from anon;
revoke execute on function public.admin_skip_participant(uuid, uuid) from anon;
revoke execute on function public.admin_open_voting(uuid) from anon;
revoke execute on function public.admin_pause_voting(uuid) from anon;
revoke execute on function public.admin_close_voting(uuid) from anon;
revoke execute on function public.admin_finish_event(uuid) from anon;
revoke execute on function public.get_leaderboard(uuid) from anon;
