import { GrowthWorkspace } from '@/components/growth/growth-workspace';

export default async function GrowthPage({
  params,
}: {
  params: Promise<{ venuePath: string }>;
}) {
  const { venuePath } = await params;
  return <GrowthWorkspace venuePath={venuePath} />;
}
