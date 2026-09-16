export default function Loading() {
  return (
    <div className="min-h-viewport">
      <header className="rule-thick">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em]">Literary Club</p>
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          <p className="font-display text-lg font-black uppercase tracking-tight">Admin</p>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="border-[3px] border-foreground p-8">
          <p className="eyebrow">One moment</p>
          <p className="font-display mt-3 text-3xl font-black">Loading the dashboard…</p>
        </div>
      </div>
    </div>
  );
}
