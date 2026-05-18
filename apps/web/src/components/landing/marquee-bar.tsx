"use client";

import { Activity, Crown, Dice5, Gamepad2, Joystick, Spade, Target, Trophy } from "lucide-react";
import { Marquee } from "@/components/effects/marquee";

const items = [
  { icon: Crown, label: "Cue & Cobra" },
  { icon: Joystick, label: "Pixel Arena" },
  { icon: Spade, label: "Black 8 Lounge" },
  { icon: Dice5, label: "Knight & Pawn" },
  { icon: Target, label: "Bullseye Club" },
  { icon: Trophy, label: "Champion's Cue" },
  { icon: Gamepad2, label: "Neon Bytes" },
  { icon: Activity, label: "The Break Room" },
];

const facts = [
  "Realtime · sub-300 ms",
  "Multi-tenant from day one",
  "Audit log on every action",
  "PostgreSQL · Drizzle ORM",
  "240+ venues running daily",
  "Built for busy nights",
];

export function MarqueeBar() {
  return (
    <section className="relative py-10">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <p className="mb-6 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          Trusted by venues across Europe
        </p>
        <Marquee duration={36}>
          {items.map((v) => (
            <span
              key={v.label}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm text-zinc-300 backdrop-blur transition hover:border-emerald-400/30 hover:text-white"
            >
              <v.icon size={14} className="text-emerald-300/80" />
              {v.label}
            </span>
          ))}
        </Marquee>

        <div className="mt-5">
          <Marquee duration={48} reverse>
            {facts.map((f) => (
              <span
                key={f}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-violet-500/10 px-5 py-2 text-xs text-zinc-300 backdrop-blur"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {f}
              </span>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
