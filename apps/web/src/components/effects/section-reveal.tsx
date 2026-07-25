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

type SectionRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Stagger direct children via variants (keep child count small). */
  stagger?: boolean;
};

/**
 * One premium entrance per section — opacity + translateY only.
 * Compact devices keep a shorter/smaller reveal (not animation-free).
 * Reduced motion: final state immediately.
 */
export function SectionReveal({
  children,
  className,
  delay = 0,
  stagger = false,
}: SectionRevealProps) {
  const cap = useMotionCapability();
  const reduced = useReducedMotion() ?? false;

  if (reduced || cap === "reduced") {
    return <div className={cn(className)}>{children}</div>;
  }

  const y =
    cap === "compact" ? motionDistance.mobile : motionDistance.desktop;
  const duration =
    cap === "compact"
      ? motionDuration.sectionCompact
      : motionDuration.section;
  const childStagger = cap === "compact" ? 0.04 : 0.07;

  return (
    <motion.div
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={sectionRevealViewport}
      variants={{
        hidden: {},
        visible: {
          transition: stagger
            ? { staggerChildren: childStagger, delayChildren: delay }
            : { delay },
        },
      }}
    >
      {stagger ? (
        children
      ) : (
        <motion.div
          variants={{
            hidden: { opacity: 0, y },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration, ease: motionEase },
            },
          }}
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  );
}

/** Child item for `SectionReveal stagger` — opacity + y only. */
export function SectionRevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const cap = useMotionCapability();
  const y =
    cap === "compact" ? motionDistance.mobile : motionDistance.desktop;
  const duration =
    cap === "compact"
      ? motionDuration.sectionCompact
      : motionDuration.section;

  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration, ease: motionEase },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
