import { PublicBookingManage } from '@/components/growth/public-booking-manage';

export default async function PublicBookingManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reservationId?: string; token?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return (
    <PublicBookingManage
      slug={slug}
      reservationId={query.reservationId ?? ''}
      token={query.token ?? ''}
    />
  );
}
