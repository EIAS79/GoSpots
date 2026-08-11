"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import {
  VENUE_PATH_STORAGE_KEY,
  setStoredVenuePath,
} from "@/lib/venue-api-headers";
import { dashboardHref } from "@/lib/venue-dashboard";

const VenueContext = createContext<string | null>(null);

export function VenuePathProvider({
  venuePath,
  apiVenuePath,
  children,
}: {
  /** Public slug for UI links (`/dashboard/{slug}/…`). */
  venuePath: string;
  /** Slug for API `x-venue-path` (sessionStorage; membership-only bind). */
  apiVenuePath?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const value = apiVenuePath ?? venuePath;
    setStoredVenuePath(value);
    return () => {
      // Don't wipe a remount/newer venue (React Strict Mode + fast switches).
      if (typeof window === "undefined") return;
      if (sessionStorage.getItem(VENUE_PATH_STORAGE_KEY) === value) {
        setStoredVenuePath(null);
      }
    };
  }, [venuePath, apiVenuePath]);

  return (
    <VenueContext.Provider value={venuePath}>{children}</VenueContext.Provider>
  );
}

export function useVenuePathOptional(): string | null {
  return useContext(VenueContext);
}

export function useVenuePath(): string {
  const path = useVenuePathOptional();
  if (!path) {
    throw new Error("useVenuePath must be used inside VenuePathProvider");
  }
  return path;
}

export function useVenueHref(segment = ""): string {
  const venuePath = useVenuePath();
  return dashboardHref(venuePath, segment);
}

export function useVenueHrefOptional(segment = ""): string | null {
  const venuePath = useVenuePathOptional();
  return venuePath ? dashboardHref(venuePath, segment) : null;
}
