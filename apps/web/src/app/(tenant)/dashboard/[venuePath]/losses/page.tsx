"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVenueHref } from "@/lib/venue-context";

/** @deprecated Use Finance → Losses tab */
export default function LossesRedirectPage() {
  const router = useRouter();
  const href = useVenueHref("/finance?tab=losses");

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
