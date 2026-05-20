"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVenueHref } from "@/lib/venue-context";

/** @deprecated Use Finance → Transactions tab */
export default function InvoicesRedirectPage() {
  const router = useRouter();
  const href = useVenueHref("/finance?tab=transactions");

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
