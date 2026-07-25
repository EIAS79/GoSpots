"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useMotionCapability } from "@/lib/motion-capability";
import { useActiveWhenVisible } from "@/lib/use-active-when-visible";

type MarqueeProps = {
  children: ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
  fade?: boolean;
};

/**
 * Horizontal marquee — one transform loop, paused when offscreen / reduced /
 * compact (static wrap row instead).
 */
export function Marquee({
  children,
  duration = 30,
  reverse = false,
  className,
  fade = true,
}: MarqueeProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const cap = useMotionCapability();
  const ref = useRef<HTMLDivElement>(null);
  const active = useActiveWhenVisible(ref);

  const animate =
    !reduceMotion &&
    cap !== "reduced" &&
    cap !== "compact" &&
    active;

  if (cap === "compact" || reduceMotion) {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex w-full gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex w-full overflow-hidden",
        fade &&
          "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className,
      )}
    >
      <motion.div
        className="flex shrink-0 gap-8 pr-8 will-change-transform"
        animate={
          animate
            ? { x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }
            : { x: "0%" }
        }
        transition={
          animate
            ? { duration, ease: "linear", repeat: Infinity }
            : undefined
        }
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}
