"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/** Tracks direct phone/email actions on public venue pages without collecting the address/number. */
export function PublicContactLinkTracker() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href") ?? "";
      const contactMethod = href.startsWith("tel:")
        ? "phone"
        : href.startsWith("mailto:")
          ? "email"
          : null;
      if (!contactMethod) return;

      const match = window.location.pathname.match(/^\/venue\/([^/]+)/);
      if (!match?.[1]) return;

      let venueSlug = match[1];
      try {
        venueSlug = decodeURIComponent(venueSlug);
      } catch {
        // Keep the encoded slug if the path is malformed.
      }

      trackEvent({
        event: "contact_venue",
        venue_slug: venueSlug,
        contact_method: contactMethod,
        source: "direct_link",
      });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
