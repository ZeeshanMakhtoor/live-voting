export default function AdminDashboardPage() {
  // Scaffold only. The next phase adds participant management and live
  // event controls here, backed by Supabase queries/RPCs guarded by RLS.
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Event Dashboard</h1>
      <p className="text-sm text-muted-foreground">No event configured yet.</p>
    </div>
  );
}
