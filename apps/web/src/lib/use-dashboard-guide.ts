"use client";

import { useMemo } from "react";
import {
  translateGuide,
  type GuideSection,
} from "@/lib/i18n";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export function useDashboardGuide(section: GuideSection) {
  const ctx = useVenueSettingsOptional();
  const locale = ctx?.locale ?? "en";
  return useMemo(() => translateGuide(locale, section), [locale, section]);
}
