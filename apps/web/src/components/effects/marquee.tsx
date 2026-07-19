"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type MarqueeProps = {
  children: ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
  fade?: boolean;
};

export function Marquee({
  children,
  duration = 30,
  reverse = false,
  className,
  fade = true,
}: MarqueeProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "relative flex w-full overflow-hidden",
        fade &&
          "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className,
      )}
    >
      <motion.div
        className="flex shrink-0 gap-8 pr-8"
        animate={
          reduceMotion
            ? undefined
            : { x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration, ease: "linear", repeat: Infinity }
        }
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}
