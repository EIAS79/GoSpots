"use client";

import { SectionDivider } from "@/components/effects/section-divider";
import { Audience } from "./audience";
import { Cta } from "./cta";
import { Faq } from "./faq";
import { Features } from "./features";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { MarqueeBar } from "./marquee-bar";
import { Navbar } from "./navbar";
import { PilotCityCta } from "./pilot-city-cta";
import { Pricing } from "./pricing";
import { StatsStrip } from "./stats-strip";
import { VenuePainPoints } from "./venue-pain-points";
import { Venues } from "./venues";
import { WhoItsFor } from "./who-its-for";
import { ScrollToTopButton } from "@/components/effects/scroll-to-top-button";

/** Owner acquisition landing — guest discovery is `/venues`. */
export function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="relative overflow-hidden">
        <Hero />
        <PilotCityCta />
        <MarqueeBar />
        <SectionDivider tone="emerald" />
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
        <Faq />
        <Cta />
      </main>
      <Footer />
      <ScrollToTopButton />
    </>
  );
}
