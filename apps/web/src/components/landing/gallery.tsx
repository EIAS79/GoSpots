"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Reveal } from "@/components/effects/reveal";
import { VenueCoverImage } from "@/components/ui/venue-cover-image";
import { gallery } from "@/lib/gallery";
import { cn } from "@/lib/cn";

const spans = [
  "col-span-1 row-span-1 sm:col-span-2 sm:row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1 sm:row-span-2",
  "col-span-1 row-span-1 sm:col-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1 sm:col-span-2",
  "col-span-1 row-span-1",
];

export function Gallery() {
  return (
    <section id="gallery" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-amber-700 dark:text-amber-300">
            Atmosphere · not a venue list
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            The kinds of nights{" "}
            <span className="text-gradient">GoSpots is for.</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            Stock photography for mood only — it does not represent partner venues or
            live availability.
          </p>
        </Reveal>

        <div className="mt-12 grid auto-rows-[150px] grid-cols-2 gap-2.5 sm:auto-rows-[180px] sm:grid-cols-3 sm:gap-3 lg:auto-rows-[200px] lg:grid-cols-4">
          {gallery.map((g, i) => (
            <motion.figure
              key={g.src}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.05 }}
              className={cn(
                "group relative cursor-default overflow-hidden rounded-2xl border border-white/10 bg-zinc-900",
                spans[i % spans.length],
              )}
            >
              <VenueCoverImage
                src={g.src}
                alt={g.alt}
                sizes="(max-width: 768px) 50vw, 25vw"
                className="transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent opacity-90" />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/5 transition group-hover:ring-amber-400/30" />

              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 sm:p-4">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 backdrop-blur">
                    {g.tag}
                  </span>
                  {g.city && (
                    <p className="mt-1.5 hidden items-center gap-1 text-xs text-zinc-300 sm:inline-flex">
                      <MapPin size={11} className="text-zinc-500" />
                      {g.city}
                    </p>
                  )}
                </div>
                <span className="hidden h-8 w-8 translate-y-1 place-items-center rounded-full border border-white/15 bg-black/40 text-zinc-200 opacity-0 backdrop-blur transition-all sm:grid group-hover:translate-y-0 group-hover:border-amber-400/40 group-hover:text-amber-200 group-hover:opacity-100">
                  <ArrowUpRight size={14} />
                </span>
              </figcaption>

              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-amber-400/0 via-amber-400/0 to-transparent transition group-hover:from-amber-400/10"
              />
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
