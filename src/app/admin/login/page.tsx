import { LoginForm } from "./login-form";

export default function AdminLoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-xl font-semibold">Admin Sign In</h1>
      <LoginForm />
    </div>
  );
}
