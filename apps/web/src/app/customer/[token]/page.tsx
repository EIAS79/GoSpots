import type { Metadata } from "next";
import { CustomerPortal } from "@/components/customer/customer-portal";

export const metadata: Metadata = {
  title: "Customer portal | GoSpots",
  robots: { index: false, follow: false },
};

export default async function CustomerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CustomerPortal token={token} />;
}
