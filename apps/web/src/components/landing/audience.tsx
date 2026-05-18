"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Building2, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Magnetic } from "@/components/effects/magnetic";
import { Reveal } from "@/components/effects/reveal";
import { Spotlight } from "@/components/effects/spotlight";
import { cn } from "@/lib/cn";
import { ownerSteps, playerSteps } from "@/lib/mock-data";

type Mode = "owner" | "player";

export function Audience() {
  const [mode, setMode] = useState<Mode>("owner");

  const steps = mode === "owner" ? ownerSteps : playerSteps;
  const heading =
    mode === "owner" ? "I run a venue" : "I want to play somewhere";
  const subheading =
    mode === "owner"
      ? "Turn your billiard hall or gaming lounge into a live, controlled operation in minutes."
      : "Find a great spot to play, reserve a table, and pay clean — no awkward arguing at the counter.";
  const ctaLabel =
    mode === "owner" ? "Create my venue account" : "Browse venues near me";
  const ctaHref = mode === "owner" ? "/dashboard" : "#venues";

  return (
    <section id="how" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="flex flex-col items-center gap-6 text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            Two paths · one platform
          </span>

          <div className="relative inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
            {(["owner", "player"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors",
                  mode === m ? "text-zinc-950" : "text-zinc-300",
                )}
              >
                {m === "owner" ? (
                  <Building2 size={15} />
                ) : (
                  <Gamepad2 size={15} />
                )}
                {m === "owner" ? "Venue owner" : "Player"}
                {mode === m && (
                  <motion.span
                    layoutId="audience-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-[0_10px_30px_-8px_rgba(52,211,153,0.7)]"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={{ duration: 0.35 }}
              className="max-w-2xl"
            >
              <h2 className="text-balance text-3xl font-bold leading-tight md:text-5xl">
                {heading}
              </h2>
              <p className="mt-4 text-base text-zinc-400 md:text-lg">
                {subheading}
              </p>
            </motion.div>
          </AnimatePresence>
        </Reveal>

        <div className="mt-14">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3 }}
              className="grid gap-4 md:grid-cols-3"
            >
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: i * 0.08 }}
                >
                  <Spotlight className="rounded-2xl">
                    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6 transition-all hover:border-white/20">
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="flex items-center justify-between">
                        <span className="relative grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-zinc-900">
                          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400/20 to-violet-400/20 opacity-0 blur transition-opacity group-hover:opacity-100" />
                          <step.icon size={18} className="relative text-emerald-300" />
                        </span>
                        <span className="font-mono text-xs text-zinc-600">
                          0{i + 1}
                        </span>
                      </div>
                      <h3 className="mt-5 text-lg font-semibold text-white">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                        {step.description}
                      </p>
                    </div>
                  </Spotlight>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <Reveal delay={0.1} className="mt-10 flex justify-center">
          <Magnetic strength={0.3}>
            <Link
              href={ctaHref}
              className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              {ctaLabel}
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </Magnetic>
        </Reveal>
      </div>
    </section>
  );
}
