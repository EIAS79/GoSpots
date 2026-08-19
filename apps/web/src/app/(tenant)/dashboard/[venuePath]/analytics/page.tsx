import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';
import { Phase14OwnerIntelligence } from '@/components/analytics/phase14-owner-intelligence';

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ venuePath: string }>;
}) {
  const { venuePath } = await params;
  return (
    <div className="space-y-8">
      <Phase14OwnerIntelligence venuePath={venuePath} />
      <AnalyticsWorkspace venuePath={venuePath} />
    </div>
  );
}
