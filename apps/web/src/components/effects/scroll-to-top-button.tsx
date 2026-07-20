"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Floating control — appears after scrolling down; jumps back to top. */
export function ScrollToTopButton({
  className,
  threshold = 420,
}: {
  className?: string;
  threshold?: number;
}) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          key="scroll-top"
          initial={reduced ? false : { opacity: 0, y: 12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? undefined : { opacity: 0, y: 8, scale: 0.94 }}
          transition={{ duration: 0.25 }}
          aria-label="Back to top"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
          }
          className={cn(
            "fixed bottom-6 right-5 z-50 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-zinc-950/85 text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md transition hover:border-emerald-400/40 hover:bg-emerald-500/20 hover:text-emerald-100 sm:bottom-8 sm:right-8",
            className,
          )}
        >
          <ArrowUp size={18} strokeWidth={2.25} />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
