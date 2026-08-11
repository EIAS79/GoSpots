import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ venuePath: string }>;
}) {
  const { venuePath } = await params;
  return <AnalyticsWorkspace venuePath={venuePath} />;
}
