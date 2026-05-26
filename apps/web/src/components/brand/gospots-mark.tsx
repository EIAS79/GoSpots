"use client";

import { motion } from "framer-motion";
import {
  GOSPOTS_G_STROKE,
  GOSPOTS_PIN_PATH,
  GOSPOTS_STAR_PATH,
  GOSPOTS_VIEW_H,
  GOSPOTS_VIEW_W,
} from "@/components/brand/gospots-mark-paths";
import { cn } from "@/lib/cn";

type GoSpotsMarkProps = {
  /** Width in px; height scales to pin aspect ratio */
  size?: number;
  className?: string;
  animated?: boolean;
};

export function GoSpotsMark({
  size = 40,
  className,
  animated = true,
}: GoSpotsMarkProps) {
  const height = Math.round(size * (GOSPOTS_VIEW_H / GOSPOTS_VIEW_W));
  const StarEl = animated ? motion.path : "path";
  const RingEl = animated ? motion.circle : "circle";

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${GOSPOTS_VIEW_W} ${GOSPOTS_VIEW_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient
          id="gospots-pin-grad"
          x1="8"
          y1="4"
          x2="40"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="45%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient
          id="gospots-pin-shine"
          x1="14"
          y1="8"
          x2="34"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient
          id="gospots-star-glow"
          cx="24"
          cy="20"
          r="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <filter id="gospots-pin-shadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.45" />
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Destination rings */}
      {animated ? (
        <motion.circle
          cx="24"
          cy="22"
          r="14"
          stroke="url(#gospots-pin-grad)"
          strokeWidth="0.75"
          strokeOpacity="0.35"
          fill="none"
          animate={{ r: [13, 16, 13], opacity: [0.2, 0.45, 0.2] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <circle
          cx="24"
          cy="22"
          r="14"
          stroke="#a78bfa"
          strokeWidth="0.75"
          strokeOpacity="0.25"
          fill="none"
        />
      )}

      <g filter="url(#gospots-pin-shadow)">
        <path d={GOSPOTS_PIN_PATH} fill="url(#gospots-pin-grad)" />
        <path d={GOSPOTS_PIN_PATH} fill="url(#gospots-pin-shine)" />
      </g>

      {/* Pin tip highlight */}
      <path
        d="M24 48 L20 38 C22 40 26 40 28 38 Z"
        fill="#7c3aed"
        fillOpacity="0.35"
      />

      <circle cx="24" cy="20" r="11" fill="url(#gospots-star-glow)" opacity="0.55" />

      <StarEl
        d={GOSPOTS_STAR_PATH}
        fill="#fef08a"
        stroke="#fbbf24"
        strokeWidth="0.6"
        strokeLinejoin="round"
        {...(animated
          ? {
              animate: { opacity: [0.85, 1, 0.85] },
              transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
            }
          : {})}
      />

      {/* Letter G — destination “you are here” mark */}
      <path
        d={GOSPOTS_G_STROKE}
        stroke="#fff"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.95"
      />
      <path
        d={GOSPOTS_G_STROKE}
        stroke="#fde68a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.5"
      />

      {/* Inner pin dot (map target) */}
      <RingEl
        cx="24"
        cy="22"
        r="2.2"
        fill="#1e1b4b"
        stroke="#fef3c7"
        strokeWidth="0.8"
        {...(animated
          ? {
              animate: { opacity: [0.7, 1, 0.7] },
              transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
            }
          : {})}
      />
    </svg>
  );
}
