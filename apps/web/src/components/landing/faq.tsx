"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Reveal } from "@/components/effects/reveal";
import { faqs } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

export function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-24">
      <div className="mx-auto max-w-4xl px-4 md:px-8">
        <Reveal className="text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            Common questions
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Everything you might want to{" "}
            <span className="text-gradient">ask first.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur">
            {faqs.map((f, i) => {
              const open = openIdx === i;
              return (
                <div key={f.q} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="group flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/[0.02]"
                    aria-expanded={open}
                  >
                    <span
                      className={cn(
                        "text-base font-medium transition-colors",
                        open ? "text-white" : "text-zinc-200 group-hover:text-white",
                      )}
                    >
                      {f.q}
                    </span>
                    <motion.span
                      animate={{ rotate: open ? 45 : 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 22 }}
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors",
                        open
                          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                          : "border-white/10 bg-white/5 text-zinc-400",
                      )}
                    >
                      <Plus size={14} />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-400">
                          {f.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
