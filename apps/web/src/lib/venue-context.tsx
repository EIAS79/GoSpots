"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { setStoredVenuePath } from "@/lib/venue-api-headers";

const VenueContext = createContext<string | null>(null);

export function VenuePathProvider({
  venuePath,
  children,
}: {
  venuePath: string;
  children: ReactNode;
}) {
  useEffect(() => {
    setStoredVenuePath(venuePath);
    return () => setStoredVenuePath(null);
  }, [venuePath]);

  return (
    <VenueContext.Provider value={venuePath}>{children}</VenueContext.Provider>
  );
}

export function useVenuePath(): string {
  const path = useContext(VenueContext);
  if (!path) {
    throw new Error("useVenuePath must be used inside VenuePathProvider");
  }
  return path;
}

export function useVenueHref(segment = ""): string {
  const venuePath = useVenuePath();
  const base = `/dashboard/${venuePath}`;
  if (!segment) return base;
  return `${base}${segment.startsWith("/") ? segment : `/${segment}`}`;
}
