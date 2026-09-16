import { LoginForm } from "./login-form";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="rule-thick">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em]">Literary Club</p>
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          <p className="font-display text-lg font-black uppercase tracking-tight">Admin</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <p className="eyebrow">Restricted</p>
        <h1 className="font-display mt-2 text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl">
          Event control
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in to run the live event. This area is for club organisers only.
        </p>

        {searchParams.denied && (
          <p
            role="alert"
            className="mt-6 border-2 border-destructive bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground"
          >
            That account isn&apos;t an event administrator.
          </p>
        )}

        <div className="mt-8 border-[3px] border-foreground p-6">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
