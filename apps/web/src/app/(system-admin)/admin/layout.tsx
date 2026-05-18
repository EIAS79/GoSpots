import type { ReactNode } from "react";

export default function SystemAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-8 py-4">
        <span className="text-sm font-medium text-violet-400">
          System Admin
        </span>
      </header>
      {children}
    </div>
  );
}
