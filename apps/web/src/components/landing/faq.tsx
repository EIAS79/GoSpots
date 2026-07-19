"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Reveal } from "@/components/effects/reveal";
import { ownerFaqs, playerFaqs } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { useMode } from "./mode-context";

export function Faq() {
  const { mode } = useMode();
  const isPlay = mode === "play";
  const items = isPlay ? playerFaqs : ownerFaqs;
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  useEffect(() => {
    setOpenIdx(0);
  }, [mode]);

  return (
    <section id="faq" className="relative py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 md:px-8">
        <Reveal className="text-center">
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-widest",
              isPlay
                ? "text-cyan-700 dark:text-cyan-400"
                : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            Common questions
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Everything you might want to{" "}
            <span className="text-gradient">ask first.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.025]"
            >
              {items.map((f, i) => {
                const open = openIdx === i;
                return (
                  <div key={f.q} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenIdx(open ? null : i)}
                      className="group flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      aria-expanded={open}
                    >
                      <span
                        className={cn(
                          "text-base font-medium transition-colors",
                          open
                            ? "text-[var(--color-foreground)] dark:text-white"
                            : "text-zinc-800 group-hover:text-zinc-900 dark:text-zinc-200 dark:group-hover:text-white",
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
                            ? isPlay
                              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                              : "border-emerald-400/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400",
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
                          <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {f.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </Reveal>
      </div>
    </section>
  );
}
