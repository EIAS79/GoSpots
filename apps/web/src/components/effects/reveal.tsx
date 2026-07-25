"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useMotionCapability } from "@/lib/motion-capability";
import {
  motionDistance,
  motionDuration,
  motionEase,
  sectionRevealViewport,
} from "@/lib/motion-system";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
  as?: "div" | "section" | "article" | "h2" | "h3" | "p";
};

/**
 * Lightweight block reveal (headings / callouts inside sections).
 * Compact keeps a short opacity+y entrance; reduced-motion is instant.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y,
  amount = 0.2,
}: RevealProps) {
  const cap = useMotionCapability();
  const reduced = useReducedMotion() ?? false;

  if (reduced || cap === "reduced") {
    return <div className={cn(className)}>{children}</div>;
  }

  const distance =
    y ??
    (cap === "compact" ? motionDistance.mobile : motionDistance.desktop);
  const duration =
    cap === "compact"
      ? motionDuration.sectionCompact
      : motionDuration.section;

  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ ...sectionRevealViewport, amount }}
      transition={{ duration, delay, ease: motionEase }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
