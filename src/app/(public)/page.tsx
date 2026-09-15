export default function AudienceHomePage() {
  // Scaffold only. The next phase wires this to the active event/participant
  // via Supabase (initial fetch in a Server Component + a Realtime
  // subscription on the client for live updates) and the 1-5 rating form.
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold">Literary Club Live Voting</h1>
      <p className="text-sm text-muted-foreground">Waiting for the event to start&hellip;</p>
    </div>
  );
}
