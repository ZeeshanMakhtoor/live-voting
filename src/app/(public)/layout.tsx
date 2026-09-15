export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-8">{children}</main>;
}
