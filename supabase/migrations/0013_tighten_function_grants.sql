-- `revoke execute ... from anon` does not remove Postgres's implicit EXECUTE
-- grant to PUBLIC, so is_admin() was still reachable at /rest/v1/rpc/is_admin
-- by anonymous callers despite the revoke in 0012. set_updated_at is a trigger
-- function and is never meant to be called over the API at all.
--
-- After this migration the anon-callable surface is exactly two functions:
-- cast_vote and get_public_top3.

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
