"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import {
  LOCORA_DOOR_PATH,
  LOCORA_GRID_LINES,
  LOCORA_PANEL_PATH,
  LOCORA_SIGNAL_ARCS,
  LOCORA_VIEW_H,
  LOCORA_VIEW_W,
} from "@/components/brand/locora-mark-paths";
import { cn } from "@/lib/cn";

type LocoraMarkProps = {
  /** Width in px; height scales to mark aspect ratio */
  size?: number;
  className?: string;
  animated?: boolean;
};

/**
 * Theme-aware Locora mark: doorway (public venue) + grid (dashboard) + signal (publish).
 * Colors follow --app-accent / cool / rose tokens for light + dark.
 */
export function LocoraMark({
  size = 40,
  className,
  animated = true,
}: LocoraMarkProps) {
  const uid = useId().replace(/:/g, "");
  const height = Math.round(size * (LOCORA_VIEW_H / LOCORA_VIEW_W));

  const doorGrad = `lc-door-${uid}`;
  const panelGrad = `lc-panel-${uid}`;
  const shine = `lc-shine-${uid}`;
  const signalGrad = `lc-signal-${uid}`;
  const glow = `lc-glow-${uid}`;
  const shadow = `lc-shadow-${uid}`;

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${LOCORA_VIEW_W} ${LOCORA_VIEW_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={doorGrad}
          x1="10"
          y1="4"
          x2="38"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--app-accent-2)" />
          <stop offset="45%" stopColor="var(--app-accent)" />
          <stop offset="100%" stopColor="var(--app-accent-3)" />
        </linearGradient>
        <linearGradient
          id={panelGrad}
          x1="18"
          y1="16"
          x2="30"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0%"
            stopColor="color-mix(in srgb, var(--app-surface) 75%, var(--app-cool) 25%)"
          />
          <stop
            offset="100%"
            stopColor="color-mix(in srgb, var(--app-fg) 45%, var(--app-cool) 55%)"
          />
        </linearGradient>
        <linearGradient
          id={shine}
          x1="14"
          y1="6"
          x2="34"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={signalGrad}
          x1="40"
          y1="12"
          x2="48"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--app-cool)" />
          <stop offset="55%" stopColor="var(--app-accent-2)" />
          <stop offset="100%" stopColor="var(--app-accent-3)" />
        </linearGradient>
        <radialGradient
          id={glow}
          cx="24"
          cy="28"
          r="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--app-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--app-cool)" stopOpacity="0" />
        </radialGradient>
        <filter id={shadow} x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="2"
            floodColor="var(--app-fg)"
            floodOpacity="0.25"
          />
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="4.5"
            floodColor="var(--app-accent)"
            floodOpacity="0.35"
          />
        </filter>
      </defs>

      <circle cx="24" cy="28" r="20" fill={`url(#${glow})`} opacity="0.55" />

      <g filter={`url(#${shadow})`}>
        <path d={LOCORA_DOOR_PATH} fill={`url(#${doorGrad})`} />
        <path d={LOCORA_DOOR_PATH} fill={`url(#${shine})`} opacity="0.5" />
        <path
          d={LOCORA_DOOR_PATH}
          fill="none"
          stroke="color-mix(in srgb, #fff 35%, transparent)"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      </g>

      <path d={LOCORA_PANEL_PATH} fill={`url(#${panelGrad})`} opacity="0.95" />
      <g
        stroke="color-mix(in srgb, var(--app-cool) 70%, #fff)"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.7"
      >
        {LOCORA_GRID_LINES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Threshold accent */}
      <path
        d="M16 48 H32"
        stroke="var(--app-accent-2)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Publish signal */}
      <g
        stroke={`url(#${signalGrad})`}
        strokeWidth="1.35"
        strokeLinecap="round"
        fill="none"
      >
        {LOCORA_SIGNAL_ARCS.map((d, i) =>
          animated ? (
            <motion.path
              key={d}
              d={d}
              animate={{ opacity: [0.25, 0.95, 0.25] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.28,
              }}
            />
          ) : (
            <path key={d} d={d} opacity={0.35 + i * 0.2} />
          ),
        )}
      </g>

      {/* Core beacon */}
      {animated ? (
        <motion.circle
          cx="35.5"
          cy="26"
          r="2.1"
          fill="var(--app-cool)"
          stroke="var(--app-accent-2)"
          strokeWidth="0.7"
          animate={{ opacity: [0.7, 1, 0.7], scale: [0.92, 1.08, 0.92] }}
          style={{ transformOrigin: "35.5px 26px" }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <circle
          cx="35.5"
          cy="26"
          r="2.1"
          fill="var(--app-cool)"
          stroke="var(--app-accent-2)"
          strokeWidth="0.7"
        />
      )}
    </svg>
  );
}
