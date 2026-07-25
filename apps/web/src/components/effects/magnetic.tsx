"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFinePointer, useMotionCapability } from "@/lib/motion-capability";

type MagneticProps = {
  children: ReactNode;
  className?: string;
  strength?: number;
};

/**
 * Desktop fine-pointer only. Bounds cached on enter — no per-move layout thrash.
 */
export function Magnetic({
  children,
  className,
  strength = 0.28,
}: MagneticProps) {
  const cap = useMotionCapability();
  const fine = useFinePointer();
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const bounds = useRef<DOMRect | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 280, damping: 22, mass: 0.35 });
  const sy = useSpring(y, { stiffness: 280, damping: 22, mass: 0.35 });
  const raf = useRef(0);
  const pending = useRef<{ cx: number; cy: number } | null>(null);

  const enabled = cap === "full" && fine && !reduced;

  if (!enabled) {
    return <div className={cn("inline-flex", className)}>{children}</div>;
  }

  const flush = () => {
    raf.current = 0;
    const p = pending.current;
    const b = bounds.current;
    if (!p || !b) return;
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    x.set((p.cx - cx) * strength);
    y.set((p.cy - cy) * strength);
  };

  return (
    <motion.div
      ref={ref}
      onPointerEnter={() => {
        bounds.current = ref.current?.getBoundingClientRect() ?? null;
      }}
      onPointerMove={(e) => {
        pending.current = { cx: e.clientX, cy: e.clientY };
        if (!raf.current) raf.current = requestAnimationFrame(flush);
      }}
      onPointerLeave={() => {
        pending.current = null;
        if (raf.current) cancelAnimationFrame(raf.current);
        raf.current = 0;
        bounds.current = null;
        x.set(0);
        y.set(0);
      }}
      style={{ x: sx, y: sy }}
      className={cn("inline-flex", className)}
    >
      {children}
    </motion.div>
  );
}
