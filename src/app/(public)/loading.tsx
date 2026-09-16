export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="rule-thick">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em]">Literary Club</p>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Loading
          </p>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center px-4">
        <div className="w-full border-[3px] border-foreground p-8 text-center">
          <p className="eyebrow">One moment</p>
          <p className="font-display mt-3 text-3xl font-black">Loading the event…</p>
        </div>
      </main>
    </div>
  );
}
