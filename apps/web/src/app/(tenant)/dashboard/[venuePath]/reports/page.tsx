"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVenueHref } from "@/lib/venue-context";

/** @deprecated Use Finance → Reports tab */
export default function ReportsRedirectPage() {
  const router = useRouter();
  const href = useVenueHref("/finance?tab=reports");

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
