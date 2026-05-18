"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SectionDivider } from "@/components/effects/section-divider";
import { Audience } from "./audience";
import { Cta } from "./cta";
import { Faq } from "./faq";
import { Features } from "./features";
import { Footer } from "./footer";
import { Gallery } from "./gallery";
import { Hero } from "./hero";
import { MarqueeBar } from "./marquee-bar";
import { Navbar } from "./navbar";
import { Pricing } from "./pricing";
import { Testimonials } from "./testimonials";
import { Venues } from "./venues";
import { useMode } from "./mode-context";

export function LandingPage() {
  const { mode } = useMode();
  const isPlay = mode === "play";

  return (
    <>
      <Navbar />
      <main className="relative overflow-hidden">
        <Hero />
        <MarqueeBar />
        <SectionDivider tone={isPlay ? "amber" : "emerald"} />

        <AnimatePresence mode="wait" initial={false}>
          {isPlay ? (
            <motion.div
              key="play-block"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <Gallery />
              <SectionDivider tone="rose" />
              <Venues />
              <SectionDivider tone="amber" />
            </motion.div>
          ) : (
            <motion.div
              key="manage-block"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <Audience />
              <SectionDivider tone="cyan" />
              <Features />
              <SectionDivider tone="violet" />
              <Venues />
              <SectionDivider tone="emerald" />
              <Pricing />
              <SectionDivider tone="cyan" />
            </motion.div>
          )}
        </AnimatePresence>

        <Testimonials />
        <SectionDivider tone={isPlay ? "rose" : "violet"} />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
