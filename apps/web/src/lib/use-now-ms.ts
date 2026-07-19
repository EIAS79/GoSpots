"use client";

import { useEffect, useState } from "react";

/** Keeps a ticking clock for time-aware booking labels without waiting on API polls. */
export function useNowMs(tickMs = 10_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return nowMs;
}
