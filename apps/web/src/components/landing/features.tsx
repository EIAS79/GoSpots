"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { Reveal } from "@/components/effects/reveal";
import { features } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

export function Features() {
  const headFeature = features[0];
  const restFeatures = features.slice(1);

  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ["start 75%", "end 60%"],
  });
  const lineScale = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 18,
    mass: 0.4,
  });
  const dotY = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            What it does
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Everything you need to{" "}
            <span className="text-gradient">control the floor.</span>
          </h2>
          <p className="mt-4 text-base text-zinc-400 md:text-lg">
            From the moment a customer sits down to the second the bill is paid
            — GoSpots handles it.
          </p>
        </Reveal>

        <Reveal delay={0.05} className="mt-14">
          <FeaturedHero feature={headFeature} />
        </Reveal>

        <div
          ref={timelineRef}
          className="relative mx-auto mt-12 max-w-5xl pb-12"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-6 top-0 h-full w-px bg-gradient-to-b from-emerald-400/40 via-white/10 to-violet-400/40 md:left-1/2 md:-translate-x-1/2"
          />
          <motion.div
            aria-hidden
            style={{ scaleY: lineScale }}
            className="pointer-events-none absolute left-6 top-0 h-full w-px origin-top bg-gradient-to-b from-emerald-400 via-cyan-300 to-violet-400 shadow-[0_0_22px_rgba(52,211,153,0.5)] md:left-1/2 md:-translate-x-1/2"
          />
          <motion.div
            aria-hidden
            style={{ top: dotY }}
            className="pointer-events-none absolute left-6 z-10 hidden h-3 w-3 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_22px_rgba(52,211,153,0.9)] md:left-1/2 md:block"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/70" />
          </motion.div>

          <ul className="relative flex flex-col gap-10 md:gap-16">
            {restFeatures.map((f, i) => {
              const isLeft = i % 2 === 0;
              return (
                <li key={f.title} className="relative">
                  <Node index={i + 1} />
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.45 }}
                    className="grid items-center gap-6 md:grid-cols-2"
                  >
                    <div
                      className={cn(
                        "pl-14 md:pl-0",
                        isLeft
                          ? "md:col-start-1 md:col-end-2 md:pr-12 md:text-right"
                          : "md:col-start-2 md:col-end-3 md:pl-12",
                      )}
                    >
                      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.04]">
                        <div
                          className={cn(
                            "absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100",
                            f.accent ?? "from-emerald-500/20 to-emerald-500/0",
                          )}
                          aria-hidden
                        />
                        <div className="relative">
                          <div
                            className={cn(
                              "flex items-center gap-3",
                              isLeft ? "md:flex-row-reverse" : "",
                            )}
                          >
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/80 shadow-inner">
                              <f.icon size={18} className="text-emerald-300" />
                            </span>
                            <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                              Step · 0{i + 2}
                            </span>
                          </div>
                          <h3 className="mt-4 text-lg font-semibold text-white">
                            {f.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                            {f.description}
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute top-1/2 hidden h-px w-10 -translate-y-1/2 bg-gradient-to-r md:block",
                            isLeft
                              ? "right-0 translate-x-full from-transparent via-emerald-400/40 to-emerald-400/80"
                              : "left-0 -translate-x-full from-violet-400/80 via-violet-400/40 to-transparent",
                          )}
                        />
                      </div>
                    </div>
                  </motion.div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeaturedHero({ feature }: { feature: (typeof features)[number] }) {
  const Icon = feature.icon;
  return (
    <div className="rounded-3xl">
      <div className="group relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.07] via-white/[0.02] to-violet-500/[0.06] p-6 md:p-10">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-emerald-300">
              Step · 01 · The heart
            </span>
            <h3 className="mt-4 text-balance text-3xl font-bold leading-tight md:text-4xl">
              {feature.title}
            </h3>
            <p className="mt-3 max-w-xl text-base text-zinc-300">
              {feature.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-400">
              {["3-second floor view", "Live timer per resource", "Action in one tap"].map(
                (t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                  >
                    {t}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="relative grid h-28 w-28 place-items-center rounded-2xl border border-white/10 bg-zinc-950/80 shadow-[0_30px_60px_-10px_rgba(52,211,153,0.4)]">
            <Icon size={42} className="text-emerald-300" />
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-violet-400/10 opacity-60 blur" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Node({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className="absolute left-6 top-7 z-[5] -translate-x-1/2 md:left-1/2"
      aria-hidden
    >
      <span className="relative grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-zinc-950 shadow-[0_0_22px_rgba(52,211,153,0.35)]">
        <span className="font-mono text-[10px] font-bold text-emerald-300">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="absolute inset-0 rounded-full ring-1 ring-emerald-400/30" />
      </span>
    </motion.div>
  );
}
