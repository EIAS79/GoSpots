import Link from 'next/link';
import { CustomerCommerceWorkspace } from '@/components/growth/customer-commerce-workspace';

export default async function CustomerCommercePage({
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
          href={`/dashboard/${venuePath}/growth`}
        >
          Growth workspace
        </Link>
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/dashboard/${venuePath}/analytics`}
        >
          Analytics decisions
        </Link>
      </nav>
      <CustomerCommerceWorkspace />
    </div>
  );
}
