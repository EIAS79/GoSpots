"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Reveal } from "@/components/effects/reveal";
import { gallery } from "@/lib/gallery";
import { cn } from "@/lib/cn";

const spans = [
  "md:col-span-2 md:row-span-2",
  "md:col-span-1 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-1 md:row-span-2",
  "md:col-span-2 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-1 md:row-span-1",
];

export function Gallery() {
  return (
    <section id="gallery" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-amber-300">
            Places · vibes · nights
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            Cool spots,{" "}
            <span className="text-gradient">one tap away.</span>
          </h2>
          <p className="mt-4 text-base text-zinc-400 md:text-lg">
            Billiard halls, gaming lounges, snooker clubs and chess cafés —
            with live availability and reservations in seconds.
          </p>
        </Reveal>

        <div className="mt-12 grid auto-rows-[180px] grid-cols-2 gap-3 md:auto-rows-[200px] md:grid-cols-4">
          {gallery.map((g, i) => (
            <motion.figure
              key={g.src}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.05 }}
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-zinc-900",
                spans[i % spans.length],
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.src}
                alt={g.alt}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent opacity-90" />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/5 transition group-hover:ring-amber-400/40" />

              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 backdrop-blur">
                    {g.tag}
                  </span>
                  {g.city && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-zinc-300">
                      <MapPin size={11} className="text-zinc-500" />
                      {g.city}
                    </p>
                  )}
                </div>
                <span className="grid h-8 w-8 translate-y-1 place-items-center rounded-full border border-white/15 bg-black/40 text-zinc-200 opacity-0 backdrop-blur transition-all group-hover:translate-y-0 group-hover:border-amber-400/50 group-hover:text-amber-200 group-hover:opacity-100">
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
