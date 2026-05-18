import Link from 'next/link';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/operations', label: 'Operations' },
  { href: '/resources', label: 'Resources' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/reports', label: 'Reports' },
  { href: '/staff', label: 'Staff' },
  { href: '/settings', label: 'Settings' },
] as const;

export function TenantShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50 p-4">
        <Link href="/" className="mb-8 text-sm font-semibold text-emerald-400">
          VenueFlow
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
