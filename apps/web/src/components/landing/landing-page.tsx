import dynamic from "next/dynamic";
import { SectionDivider } from "@/components/effects/section-divider";
import { SectionReveal } from "@/components/effects/section-reveal";
import { ScrollToTopButton } from "@/components/effects/scroll-to-top-button";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { MarqueeBar } from "./marquee-bar";
import { Navbar } from "./navbar";
import { PilotCityCta } from "./pilot-city-cta";
import { StatsStrip } from "./stats-strip";

/**
 * Server composition shell — client boundaries stay inside interactive sections.
 * Below-the-fold sections are dynamically imported (SSR kept for crawlability).
 */
const WhoItsFor = dynamic(
  () => import("./who-its-for").then((m) => m.WhoItsFor),
  { ssr: true },
);
const Audience = dynamic(
  () => import("./audience").then((m) => m.Audience),
  { ssr: true },
);
const Features = dynamic(
  () => import("./features").then((m) => m.Features),
  { ssr: true },
);
const Venues = dynamic(
  () => import("./venues").then((m) => m.Venues),
  { ssr: true },
);
const Pricing = dynamic(
  () => import("./pricing").then((m) => m.Pricing),
  { ssr: true },
);
const VenuePainPoints = dynamic(
  () => import("./venue-pain-points").then((m) => m.VenuePainPoints),
  { ssr: true },
);
const Faq = dynamic(() => import("./faq").then((m) => m.Faq), { ssr: true });
const Cta = dynamic(() => import("./cta").then((m) => m.Cta), { ssr: true });

/** Owner acquisition landing — guest discovery is `/venues`. */
export function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="relative overflow-hidden">
        <Hero />

        <SectionReveal>
          <PilotCityCta />
        </SectionReveal>

        <SectionReveal delay={0.04}>
          <MarqueeBar />
        </SectionReveal>

        <SectionDivider tone="emerald" />

        <StatsStrip />

        <SectionReveal>
          <WhoItsFor />
        </SectionReveal>

        <SectionDivider tone="emerald" />

        <SectionReveal>
          <Audience />
        </SectionReveal>

        <SectionDivider tone="cyan" />

        <SectionReveal>
          <Features />
        </SectionReveal>

        <SectionDivider tone="violet" />

        <SectionReveal>
          <Venues />
        </SectionReveal>

        <SectionDivider tone="emerald" />

        <SectionReveal>
          <Pricing />
        </SectionReveal>

        <SectionDivider tone="cyan" />

        <SectionReveal>
          <VenuePainPoints />
        </SectionReveal>

        <SectionDivider tone="violet" />

        <SectionReveal>
          <Faq />
        </SectionReveal>

        <SectionReveal>
          <Cta />
        </SectionReveal>
      </main>
      <Footer />
      <ScrollToTopButton />
    </>
  );
}
