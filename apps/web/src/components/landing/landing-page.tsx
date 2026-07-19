"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { SectionDivider } from "@/components/effects/section-divider";
import { Audience } from "./audience";
import { CategoryShowcase } from "./category-showcase";
import { Cta } from "./cta";
import { Faq } from "./faq";
import { Features } from "./features";
import { Footer } from "./footer";
import { Gallery } from "./gallery";
import { Hero } from "./hero";
import { MarqueeBar } from "./marquee-bar";
import { Navbar } from "./navbar";
import { PlayerHighlights } from "./player-highlights";
import { Pricing } from "./pricing";
import { StatsStrip } from "./stats-strip";
import { VenuePainPoints } from "./venue-pain-points";
import { Venues } from "./venues";
import { WhoItsFor } from "./who-its-for";
import { useMode } from "./mode-context";

const EASE = [0.22, 1, 0.36, 1] as const;

const blockMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: EASE },
} as const;

export function LandingPage() {
  const { mode } = useMode();
  const isPlay = mode === "play";
  const firstRender = useRef(true);

  // Switching audience swaps whole sections — bring the user back to the top
  // so the page never appears to "collapse" mid-scroll.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [mode]);

  return (
    <>
      <Navbar />
      <main className="relative overflow-hidden">
        <Hero />
        <MarqueeBar />
        <SectionDivider tone={isPlay ? "amber" : "emerald"} />

        <AnimatePresence mode="wait" initial={false}>
          {isPlay ? (
            <motion.div key="play-block" className="relative" {...blockMotion}>
              <CategoryShowcase />
              <SectionDivider tone="cyan" />
              <Venues />
              <SectionDivider tone="rose" />
              <Gallery />
              <SectionDivider tone="violet" />
              <PlayerHighlights />
              <SectionDivider tone="amber" />
            </motion.div>
          ) : (
            <motion.div key="manage-block" className="relative" {...blockMotion}>
              <StatsStrip />
              <WhoItsFor />
              <SectionDivider tone="emerald" />
              <Audience />
              <SectionDivider tone="cyan" />
              <Features />
              <SectionDivider tone="violet" />
              <Venues />
              <SectionDivider tone="emerald" />
              <Pricing />
              <SectionDivider tone="cyan" />
              <VenuePainPoints />
              <SectionDivider tone="violet" />
            </motion.div>
          )}
        </AnimatePresence>

        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
