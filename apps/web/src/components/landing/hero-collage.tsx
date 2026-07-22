"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import Image from "next/image";
import { useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { useCompactViewport } from "@/lib/use-compact-viewport";

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
];

/** Distribute images across N columns, keeping variety per column.
 *  Two offset passes so each column is tall enough for a seamless loop. */
function buildColumns(count: number) {
  const cols: { src: string; alt: string; tall: boolean }[][] = Array.from(
    { length: count },
    () => [],
  );
  for (let pass = 0; pass < 2; pass++) {
    HERO_IMAGES.forEach((img, i) => {
      const col = (i + pass * 2 + (pass ? 1 : 0)) % count;
      cols[col].push({ ...img, tall: ((i + pass) * 7) % 3 === 0 });
    });
  }
  return cols;
}

function CollageColumn({
  images,
  direction,
  duration,
  staticMode,
}: {
  images: { src: string; alt: string; tall: boolean }[];
  direction: "up" | "down";
  duration: number;
  staticMode: boolean;
}) {
  // Duplicate content so the loop wraps seamlessly (desktop only).
  const loop = staticMode ? images.slice(0, 3) : [...images, ...images];
  const from = direction === "up" ? "0%" : "-50%";
  const to = direction === "up" ? "-50%" : "0%";

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <motion.div
        className="flex flex-col gap-3 will-change-transform md:gap-4"
        initial={{ y: from }}
        animate={staticMode ? { y: from } : { y: to }}
        transition={
          staticMode
            ? undefined
            : { duration, repeat: Infinity, ease: "linear" }
        }
      >
        {loop.map((img, i) => {
          const firstPass = staticMode || i < images.length;
          const eager =
            firstPass && (i < 4 || img.src === "/hero/bar.jpg");
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
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
                priority={eager}
              />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

/**
 * Full-bleed animated venue collage behind the hero.
 * On phones: fewer tiles, no infinite scroll / parallax (desktop unchanged).
 */
export function HeroCollage() {
  const reduced = useReducedMotion() ?? false;
  const compact = useCompactViewport();
  const staticMode = reduced || compact;
  const columns = useMemo(() => buildColumns(4), []);

  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const gridY = useTransform(scrollYProgress, [0, 1], ["0%", "4%"]);

  return (
    <div ref={ref} className="absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      <motion.div
        style={staticMode ? undefined : { y: gridY }}
        className="absolute inset-x-0 -top-[6%] bottom-[-6%] grid grid-cols-2 gap-3 px-3 sm:grid-cols-3 md:gap-4 md:px-4 lg:grid-cols-4"
      >
        {columns.map((col, i) => (
          <div
            key={i}
            className={cn(
              i === 2 && "hidden sm:block",
              i === 3 && "hidden lg:block",
            )}
          >
            <CollageColumn
              images={col}
              direction={i % 2 === 0 ? "up" : "down"}
              duration={54 + i * 9}
              staticMode={staticMode}
            />
          </div>
        ))}
      </motion.div>

      <div className="absolute inset-0 bg-zinc-950/62" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_65%_at_50%_30%,rgba(9,9,11,0.32)_0%,rgba(9,9,11,0.78)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--app-bg)]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)]/70 to-transparent md:h-64" />
    </div>
  );
}
