"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { Magnetic } from "@/components/effects/magnetic";
import { Reveal } from "@/components/effects/reveal";
import { Spotlight } from "@/components/effects/spotlight";
import { plans } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            Pricing
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Simple plans that{" "}
            <span className="text-gradient">grow with your venue.</span>
          </h2>
          <p className="mt-4 text-base text-zinc-400 md:text-lg">
            Start free. Pay only when you&apos;re ready to run live shifts. Cancel
            anytime.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 22, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.07 }}
              className="relative"
            >
              {plan.highlight && (
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  className="absolute -inset-px -z-10 rounded-2xl bg-gradient-to-b from-emerald-400/40 via-cyan-400/30 to-violet-400/20 blur-[8px]"
                />
              )}
              <Spotlight className="h-full rounded-2xl" color="rgba(52,211,153,0.16)">
                <div
                  className={cn(
                    "relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 backdrop-blur transition-all hover:-translate-y-1",
                    plan.highlight
                      ? "border-emerald-400/40 bg-gradient-to-b from-emerald-500/[0.08] to-transparent shadow-[0_30px_80px_-20px_rgba(52,211,153,0.5)]"
                      : "border-white/10 bg-white/[0.025] hover:border-white/25",
                  )}
                >
                  {plan.highlight && (
                    <>
                      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.18),transparent_60%)]" />
                      <motion.span
                        initial={{ scale: 0, rotate: -10 }}
                        whileInView={{ scale: 1, rotate: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-950 shadow-[0_8px_30px_-8px_rgba(52,211,153,0.8)]"
                      >
                        <Sparkles size={10} /> Most popular
                      </motion.span>
                    </>
                  )}

                  <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-white">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-sm text-zinc-500">{plan.period}</span>
                    )}
                  </div>

                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-zinc-300">
                    {plan.features.map((f, idx) => (
                      <motion.li
                        key={f}
                        initial={{ opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.25 + idx * 0.04 }}
                        className="flex items-start gap-2"
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                            plan.highlight
                              ? "bg-emerald-400 text-zinc-950"
                              : "bg-white/10 text-emerald-300",
                          )}
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                        <span>{f}</span>
                      </motion.li>
                    ))}
                  </ul>

                  <Magnetic strength={0.18} className="mt-8 w-full">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition",
                        plan.highlight
                          ? "bg-emerald-400 text-zinc-950 hover:bg-emerald-300 shadow-[0_10px_40px_-10px_rgba(52,211,153,0.8)]"
                          : "border border-white/10 bg-white/5 text-white hover:border-white/30 hover:bg-white/10",
                      )}
                    >
                      {plan.cta}
                    </button>
                  </Magnetic>
                </div>
              </Spotlight>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          All plans · 14-day free trial · no card required · multi-currency
        </p>
      </div>
    </section>
  );
}
