import Link from 'next/link';
import { GrowthWorkspace } from '@/components/growth/growth-workspace';

export default async function GrowthPage({
  params,
}: {
  params: Promise<{ venuePath: string }>;
}) {
  const { venuePath } = await params;
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/dashboard/${venuePath}/reservations`}
        >
          Reservation operations
        </Link>
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/dashboard/${venuePath}/growth/customer-commerce`}
        >
          Customer & commerce controls
        </Link>
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/dashboard/${venuePath}/analytics`}
        >
          Analytics decisions
        </Link>
      </nav>
      <GrowthWorkspace venuePath={venuePath} />
    </div>
  );
}
