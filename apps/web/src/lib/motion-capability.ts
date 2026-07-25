"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { COMPACT_VIEWPORT_QUERY } from "@/lib/use-compact-viewport";

export type MotionCapability = "full" | "balanced" | "compact" | "reduced";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const SAVE_DATA_HINT = () =>
  typeof navigator !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Boolean((navigator as any).connection?.saveData);

/**
 * Conservative device capability for marketing motion.
 * SSR defaults to `balanced` so desktop never flash-disables, and phones
 * hydrate into `compact` without starting invisible forever.
 */
export function useMotionCapability(): MotionCapability {
  const reduced = useReducedMotion() ?? false;
  const [cap, setCap] = useState<MotionCapability>(
    reduced ? "reduced" : "balanced",
  );

  useEffect(() => {
    if (reduced) {
      setCap("reduced");
      return;
    }

    const sync = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setCap("reduced");
        return;
      }
      if (SAVE_DATA_HINT()) {
        setCap("compact");
        return;
      }
      if (window.matchMedia(COMPACT_VIEWPORT_QUERY).matches) {
        setCap("compact");
        return;
      }
      const mem =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (navigator as any).deviceMemory === "number"
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((navigator as any).deviceMemory as number)
          : 8;
      const cores = navigator.hardwareConcurrency ?? 8;
      const fine = window.matchMedia(FINE_POINTER_QUERY).matches;
      if (!fine || mem <= 4 || cores <= 4) {
        setCap("balanced");
        return;
      }
      setCap("full");
    };

    sync();
    const mqCompact = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const mqFine = window.matchMedia(FINE_POINTER_QUERY);
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    mqCompact.addEventListener("change", sync);
    mqFine.addEventListener("change", sync);
    mqReduce.addEventListener("change", sync);
    return () => {
      mqCompact.removeEventListener("change", sync);
      mqFine.removeEventListener("change", sync);
      mqReduce.removeEventListener("change", sync);
    };
  }, [reduced]);

  return cap;
}

export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(FINE_POINTER_QUERY);
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return fine;
}
