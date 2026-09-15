-- The audience app subscribes to postgres_changes on events (see
-- AudienceApp) to detect active-participant/voting-state/status changes
-- without polling. Realtime only broadcasts tables explicitly added to
-- the supabase_realtime publication.
alter publication supabase_realtime add table public.events;
