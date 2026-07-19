"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVenueHref } from "@/lib/venue-context";

/** Invoices live under Finance → Invoices. */
export default function InvoicesRedirectPage() {
  const router = useRouter();
  const href = useVenueHref("/finance?tab=invoices");

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
