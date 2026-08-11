import { PublicGrowthBooking } from '@/components/growth/public-growth-booking';

export default async function PublicGrowthBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicGrowthBooking slug={slug} />;
}
