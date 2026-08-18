import type { ReactNode } from "react";
import Link from "next/link";

export default async function WorkforceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ venuePath: string }>;
}) {
  const { venuePath } = await params;
  return (
    <>
      <nav
        aria-label="Workforce sections"
        className="mx-auto flex w-full max-w-7xl flex-wrap gap-2 px-4 pt-4 sm:px-6"
      >
        <Link
          href={`/dashboard/${venuePath}/workforce`}
          className="min-h-11 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm"
        >
          Time & labor
        </Link>
        <Link
          href={`/dashboard/${venuePath}/workforce/accountability`}
          className="min-h-11 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm"
        >
          Accountability & owner controls
        </Link>
      </nav>
      {children}
    </>
  );
}
