"use client";

import { usePathname } from "next/navigation";

/**
 * Full-viewport painted atmosphere — layered radial/linear/conic washes,
 * brush smears, and soft glows. Not a flat fill.
 *
 * Dashboard routes stay mounted but inert: flat zinc canvas only (see `.dashboard-aurora`).
 */
export function AuroraBackground() {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard") ?? false;

  if (isDashboard) {
    return (
      <div
        aria-hidden
        className="dashboard-aurora pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-background"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden"
    >
      {/* Canvas base — already a multi-stop painted wash */}
      <div className="paint-canvas absolute inset-0" />

      {/* Slow spinning pigment mesh */}
      <div className="paint-mesh absolute inset-[-20%] opacity-90" />

      {/* Soft bloom glows */}
      <div className="paint-glow paint-glow-a" />
      <div className="paint-glow paint-glow-b" />
      <div className="paint-glow paint-glow-c" />
      <div className="paint-glow paint-glow-d" />

      {/* Brush / smear strokes — elongated, skewed, blurred */}
      <div className="paint-brush paint-brush-1" />
      <div className="paint-brush paint-brush-2" />
      <div className="paint-brush paint-brush-3" />
      <div className="paint-brush paint-brush-4" />
      <div className="paint-brush paint-brush-5" />

      {/* Ribbon streaks across the canvas */}
      <div className="paint-ribbon paint-ribbon-a" />
      <div className="paint-ribbon paint-ribbon-b" />

      {/* Fine grain + faint grid so it feels like a surface */}
      <div className="aurora-grid absolute inset-0 opacity-[0.05]" />
      <div className="aurora-stars absolute inset-0 opacity-50" />
      <div className="absolute inset-0 bg-noise opacity-50 mix-blend-overlay" />

      {/* Soft vignette — frames the painting without flattening it */}
      <div className="paint-vignette absolute inset-0" />
    </div>
  );
}
