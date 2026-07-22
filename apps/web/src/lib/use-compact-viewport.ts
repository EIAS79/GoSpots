"use client";

import { useEffect, useState } from "react";

/** Phones / narrow preview — tone down heavy motion (desktop unchanged). */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 767px)";

/**
 * True when viewport is phone-sized. SSR/first paint defaults to `false`
 * so desktop never flashes a "toned down" state.
 */
export function useCompactViewport() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return compact;
}
