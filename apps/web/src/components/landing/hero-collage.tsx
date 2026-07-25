"use client";

import {
  motion,
  useReducedMotion,
} from "framer-motion";
import Image from "next/image";
import { useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { useMotionCapability } from "@/lib/motion-capability";
import { useActiveWhenVisible } from "@/lib/use-active-when-visible";

const HERO_IMAGES = [
  { src: "/hero/billiard.jpg", alt: "Billiard hall" },
  { src: "/hero/esports.jpg", alt: "Esports arena" },
  { src: "/hero/restaurant.jpg", alt: "Restaurant" },
  { src: "/hero/arcade.jpg", alt: "Arcade" },
  { src: "/hero/cafe.jpg", alt: "Café" },
  { src: "/hero/pcgaming.jpg", alt: "PC gaming lounge" },
  { src: "/hero/bar.jpg", alt: "Bar" },
  { src: "/hero/bowling.jpg", alt: "Bowling alley" },
  { src: "/hero/controller.jpg", alt: "Console gaming" },
  { src: "/hero/boardgame.jpg", alt: "Board game café" },
  { src: "/hero/neon.jpg", alt: "Neon nightlife" },
  { src: "/hero/darts.jpg", alt: "Darts pub" },
] as const;

/** One pass only — duplicate once for CSS/Framer loop, not two distribution passes. */
function buildColumns(count: number) {
  const cols: { src: string; alt: string; tall: boolean }[][] = Array.from(
    { length: count },
    () => [],
  );
  HERO_IMAGES.forEach((img, i) => {
    cols[i % count].push({ ...img, tall: (i * 7) % 3 === 0 });
  });
  return cols;
}

function CollageColumn({
  images,
  direction,
  duration,
  staticMode,
  playing,
}: {
  images: { src: string; alt: string; tall: boolean }[];
  direction: "up" | "down";
  duration: number;
  staticMode: boolean;
  playing: boolean;
}) {
  // Static: few tiles. Animated: one seamless duplicate.
  const loop = staticMode ? images.slice(0, 3) : [...images, ...images];
  const from = direction === "up" ? "0%" : "-50%";
  const to = direction === "up" ? "-50%" : "0%";

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <motion.div
        className={cn(
          "flex flex-col gap-3 md:gap-4",
          playing && !staticMode && "will-change-transform",
        )}
        initial={{ y: from }}
        animate={
          staticMode || !playing ? { y: from } : { y: to }
        }
        transition={
          staticMode || !playing
            ? undefined
            : { duration, repeat: Infinity, ease: "linear" }
        }
      >
        {loop.map((img, i) => {
          const firstPass = staticMode || i < images.length;
          // Only the LCP-ish hero tile is priority — not a grid of eagers.
          const eager = firstPass && img.src === "/hero/bar.jpg" && i === 0;
          return (
            <div
              key={`${img.src}-${i}`}
              className={cn(
                "relative w-full shrink-0 overflow-hidden rounded-xl md:rounded-2xl",
                img.tall ? "aspect-[3/4]" : "aspect-[4/3]",
              )}
            >
              <Image
                src={img.src}
                alt=""
                role="presentation"
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 28vw"
                className="object-cover"
                priority={eager}
                loading={eager ? undefined : "lazy"}
              />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

/**
 * Hero venue collage.
 * Continuous column motion OR static poster — never both with scroll parallax.
 * Paused when offscreen / hidden / compact / reduced-motion.
 */
export function HeroCollage() {
  const reduced = useReducedMotion() ?? false;
  const cap = useMotionCapability();
  const staticMode = reduced || cap === "reduced" || cap === "compact";
  // Prefer 3 columns on desktop (was 4) — fewer DOM images + transforms.
  const columnCount = cap === "balanced" ? 3 : 3;
  const columns = useMemo(() => buildColumns(columnCount), [columnCount]);

  const ref = useRef<HTMLDivElement>(null);
  const inView = useActiveWhenVisible(ref, { rootMargin: "12% 0px" });
  const playing = !staticMode && inView;

  return (
    <div ref={ref} className="absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 -top-[6%] bottom-[-6%] grid grid-cols-2 gap-3 px-3 sm:grid-cols-3 md:gap-4 md:px-4">
        {columns.map((col, i) => (
          <div
            key={i}
            className={cn(i === 2 && "hidden sm:block")}
          >
            <CollageColumn
              images={col}
              direction={i % 2 === 0 ? "up" : "down"}
              duration={58 + i * 10}
              staticMode={staticMode}
              playing={playing}
            />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 bg-zinc-950/62" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_65%_at_50%_30%,rgba(9,9,11,0.32)_0%,rgba(9,9,11,0.78)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--app-bg)]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)]/70 to-transparent md:h-64" />
    </div>
  );
}
