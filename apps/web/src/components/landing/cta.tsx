"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Magnetic } from "@/components/effects/magnetic";

export function Cta() {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-8 md:p-14"
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/30 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-violet-500/25 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
          <div className="absolute inset-0 -z-0 bg-grid [mask-image:radial-gradient(circle_at_center,black,transparent_75%)] opacity-30" />

          <div className="relative flex flex-col items-center text-center">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-balance text-4xl font-bold leading-tight md:text-6xl"
            >
              Stop running your venue{" "}
              <span className="text-gradient">from memory.</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              className="mt-5 max-w-2xl text-base text-zinc-300 md:text-lg"
            >
              Set up your tables, train your cashier in five minutes, and start
              tonight. Free for 14 days, no card required.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
            >
              <Magnetic>
                <Link
                  href="/dashboard"
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_20px_60px_-15px_rgba(255,255,255,0.4)] transition hover:bg-zinc-200"
                >
                  Start your free venue
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </Link>
              </Magnetic>
              <Magnetic strength={0.22}>
                <Link
                  href="#venues"
                  className="rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10"
                >
                  I&apos;m a player — find a venue
                </Link>
              </Magnetic>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
