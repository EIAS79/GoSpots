"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type SpotlightProps = {
  children: ReactNode;
  className?: string;
  color?: string;
  size?: number;
};

export function Spotlight({
  children,
  className,
  color = "rgba(52,211,153,0.18)",
  size = 380,
}: SpotlightProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  return (
    <div
      ref={wrapRef}
      onMouseMove={(e) => {
        if (rafRef.current != null) return;
        const cx = e.clientX;
        const cy = e.clientY;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const wrap = wrapRef.current;
          const glow = glowRef.current;
          if (!wrap || !glow) return;
          const r = wrap.getBoundingClientRect();
          glow.style.background = `radial-gradient(${size}px circle at ${cx - r.left}px ${cy - r.top}px, ${color}, transparent 70%)`;
        });
      }}
      onMouseLeave={() => {
        if (glowRef.current) glowRef.current.style.background = "";
      }}
      className={cn("group relative", className)}
    >
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
