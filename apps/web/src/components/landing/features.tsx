"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import { useRef } from "react";
import { Reveal } from "@/components/effects/reveal";
import { features } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";

type Feature = (typeof features)[number];

const EASE = [0.22, 1, 0.36, 1] as const;

function formatStep(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Vertical timeline: a center rail that "draws" itself as you scroll,
 * numbered nodes on the rail, and cards alternating left / right.
 * Below lg the rail sits on the left and all cards stack to its right.
 */
export function Features() {
  const { t } = usePublicPrefs();
  const reduced = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ["start 0.75", "end 0.55"],
  });
  const drawn = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    mass: 0.4,
  });

  return (
    <section id="features" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            {t("features.eyebrow")}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            {t("features.title")}{" "}
            <span className="text-gradient">{t("features.titleAccent")}</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            {t("features.subtitle")}
          </p>
        </Reveal>

        <div ref={railRef} className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
          {/* Base rail (faint) — left on mobile, centered on lg+ */}
          <div
            aria-hidden
            className="absolute bottom-4 top-4 left-[18px] w-px -translate-x-1/2 bg-black/[0.08] dark:bg-white/[0.08] sm:left-[22px] lg:left-1/2"
          />
          {/* Drawn rail — fills with scroll */}
          <motion.div
            aria-hidden
            style={reduced ? undefined : { scaleY: drawn }}
            className="absolute bottom-4 top-4 left-[18px] w-px -translate-x-1/2 origin-top bg-gradient-to-b from-emerald-400 via-cyan-400 to-violet-400 shadow-[0_0_16px_rgba(52,211,153,0.45)] sm:left-[22px] lg:left-1/2"
          />

          <ol className="relative flex flex-col gap-10 sm:gap-12">
            {features.map((feature, i) => (
              <TimelineRow
                key={i}
                feature={feature}
                title={t(`features.${i + 1}.title`)}
                body={t(`features.${i + 1}.body`)}
                step={i + 1}
                side={i % 2 === 0 ? "left" : "right"}
                isHeart={i === 0}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function TimelineRow({
  feature,
  title,
  body,
  step,
  side,
  isHeart,
}: {
  feature: Feature;
  title: string;
  body: string;
  step: number;
  side: "left" | "right";
  isHeart: boolean;
}) {
  const { t } = usePublicPrefs();
  const reduced = useReducedMotion();
  const fromX = reduced ? 0 : side === "left" ? -32 : 32;

  return (
    <li className="relative">
      {/* Node on the rail */}
      <motion.span
        initial={reduced ? false : { scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="absolute left-[18px] top-6 z-10 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-emerald-400/40 bg-[var(--color-surface-2)] font-mono text-[11px] font-bold text-emerald-700 shadow-[0_0_24px_rgba(52,211,153,0.35)] dark:bg-zinc-950 dark:text-emerald-300 sm:left-[22px] sm:h-11 sm:w-11 lg:left-1/2"
        aria-hidden
      >
        {formatStep(step)}
      </motion.span>

      {/* Connector from node to card (lg+ only) */}
      <span
        aria-hidden
        className={cn(
          "absolute top-[46px] hidden h-px w-[calc(8%-22px)] bg-gradient-to-r lg:block",
          side === "left"
            ? "right-1/2 mr-[22px] from-transparent to-emerald-400/45"
            : "left-1/2 ml-[22px] from-emerald-400/45 to-transparent",
        )}
      />

      {/* Card — full width right of rail on mobile; 42% column on lg */}
      <motion.article
        initial={{ opacity: 0, y: 18, x: fromX }}
        whileInView={{ opacity: 1, y: 0, x: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease: EASE }}
        className={cn(
          "group relative ml-12 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 backdrop-blur transition-colors duration-300 hover:border-emerald-400/30 dark:border-white/10 dark:bg-white/[0.03] sm:ml-14 sm:p-6 lg:ml-0 lg:w-[42%]",
          side === "left" ? "lg:mr-auto" : "lg:ml-auto",
          isHeart &&
            "border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-violet-500/[0.05] dark:border-emerald-400/25 dark:via-white/[0.02]",
        )}
      >
        {/* Accent glow */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-gradient-to-br opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-80",
            feature.accent,
          )}
        />

        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 dark:border-white/10 dark:bg-zinc-900/80",
                isHeart
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-300",
              )}
            >
              <feature.icon size={18} />
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                isHeart
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)]/80 text-zinc-500 dark:border-white/10 dark:bg-zinc-950/60",
              )}
            >
              {formatStep(step)}
              {isHeart && (
                <span className="normal-case tracking-normal text-emerald-700 dark:text-emerald-200/90">
                  · {t("features.heart")}
                </span>
              )}
            </span>
          </div>

          <h3
            className={cn(
              "mt-4 font-semibold text-[var(--color-foreground)] dark:text-white",
              isHeart ? "text-xl sm:text-2xl" : "text-base sm:text-lg",
            )}
          >
            {title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {body}
          </p>

          {isHeart && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1 dark:border-white/10 dark:bg-white/5"
                >
                  {t(`features.chip${n}`)}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.article>
    </li>
  );
}
