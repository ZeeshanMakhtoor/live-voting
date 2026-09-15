import { LoginForm } from "./login-form";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-xs font-bold uppercase tracking-[0.3em]">Literary Club</p>
        <h1 className="mt-2 text-center text-2xl font-black uppercase tracking-tight">
          Admin Login
        </h1>
        <div className="mt-8 border-4 border-foreground p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
