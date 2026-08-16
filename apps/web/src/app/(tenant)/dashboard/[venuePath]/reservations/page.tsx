import Link from 'next/link';
import { Phase8ReservationOperations } from '@/components/reservations/phase8-reservation-operations';

export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ venuePath: string }>;
}) {
  const { venuePath } = await params;
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 px-4 pt-4 md:px-6">
        <Link className="rounded-md border px-3 py-2 text-sm font-medium" href={`/dashboard/${venuePath}/growth`}>
          Growth operations
        </Link>
        <Link className="rounded-md border px-3 py-2 text-sm font-medium" href={`/dashboard/${venuePath}/floor`}>
          Live floor
        </Link>
      </nav>
      <Phase8ReservationOperations venuePath={venuePath} />
    </div>
  );
}
