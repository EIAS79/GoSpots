"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while `ref` is near the viewport AND the document is visible.
 * Does not re-render on every frame — only on enter/leave / visibility.
 */
export function useActiveWhenVisible(
  ref: RefObject<Element | null>,
  options?: { rootMargin?: string; threshold?: number },
) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let inView = false;
    const sync = () => {
      const visible = document.visibilityState === "visible";
      setActive(inView && visible);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        sync();
      },
      {
        rootMargin: options?.rootMargin ?? "20% 0px",
        threshold: options?.threshold ?? 0.01,
      },
    );
    io.observe(el);

    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref, options?.rootMargin, options?.threshold]);

  return active;
}
