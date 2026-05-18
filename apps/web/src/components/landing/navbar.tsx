"use client";

import { motion, useMotionTemplate, useScroll, useTransform } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { navLinks } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const blurPx = useTransform(scrollY, [0, 80], [0, 14]);
  const backdrop = useMotionTemplate`blur(${blurPx}px)`;
  const bg = useTransform(
    scrollY,
    [0, 80],
    ["rgba(6,6,8,0)", "rgba(6,6,8,0.72)"],
  );
  const borderColor = useTransform(
    scrollY,
    [0, 80],
    ["rgba(255,255,255,0)", "rgba(255,255,255,0.08)"],
  );

  return (
    <motion.header
      style={{ backdropFilter: backdrop, WebkitBackdropFilter: backdrop, backgroundColor: bg, borderBottomColor: borderColor }}
      className="fixed inset-x-0 top-0 z-50 border-b"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-400 via-cyan-400 to-violet-400">
            <div className="absolute inset-[2px] rounded-md bg-zinc-950" />
            <div className="absolute inset-0 grid place-items-center text-sm font-bold text-emerald-300">
              V
            </div>
          </div>
          <span className="text-sm font-semibold tracking-tight">
            VenueFlow
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 backdrop-blur md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="#venues"
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/20"
          >
            Find a venue
          </Link>
          <Link
            href="/dashboard"
            className="group relative overflow-hidden rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
          >
            <span className="relative z-10">List your venue</span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Link>
        </div>

        <button
          type="button"
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className={cn("overflow-hidden border-t border-white/5 md:hidden")}
      >
        <div className="flex flex-col gap-1 px-4 py-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="#venues"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-center text-sm font-medium text-cyan-200"
          >
            Find a venue
          </Link>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="rounded-full bg-emerald-400 px-4 py-2 text-center text-sm font-semibold text-zinc-950"
          >
            List your venue
          </Link>
        </div>
      </motion.div>
    </motion.header>
  );
}
