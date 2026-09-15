export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b-4 border-foreground px-4 py-3">
        <p className="text-center text-xs font-bold uppercase tracking-[0.3em]">Literary Club</p>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Loading&hellip;</p>
      </main>
    </div>
  );
}
