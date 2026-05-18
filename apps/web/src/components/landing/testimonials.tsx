"use client";

import { motion } from "framer-motion";
import { Quote, Star } from "lucide-react";
import { Reveal } from "@/components/effects/reveal";
import { Spotlight } from "@/components/effects/spotlight";
import { testimonials } from "@/lib/mock-data";

export function Testimonials() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            From real venue owners
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Built for nights that{" "}
            <span className="text-gradient">actually get busy.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.1 }}
            >
              <Spotlight className="h-full rounded-2xl">
                <figure className="relative flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition hover:border-white/25">
                  <Quote className="absolute right-5 top-5 h-7 w-7 text-emerald-400/20" />
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, idx) => (
                      <Star
                        key={idx}
                        size={14}
                        className="fill-amber-300 text-amber-300"
                      />
                    ))}
                  </div>
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-zinc-200">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-5 border-t border-white/5 pt-4 text-xs">
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="mt-0.5 text-zinc-500">{t.role}</p>
                  </figcaption>
                </figure>
              </Spotlight>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
