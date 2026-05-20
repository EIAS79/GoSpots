"use client";

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "framer-motion";
import { Crown, Gamepad2, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { navLinks } from "@/lib/mock-data";
import { useMode } from "./mode-context";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { mode, setMode } = useMode();
  const isPlay = mode === "play";

  const { scrollY } = useScroll();
  const blurPx = useTransform(scrollY, [0, 80], [0, 14]);
  const backdrop = useMotionTemplate`blur(${blurPx}px)`;
  const bg = useTransform(
    scrollY,
    [0, 80],
    ["rgba(7,8,10,0)", "rgba(7,8,10,0.75)"],
  );
  const borderColor = useTransform(
    scrollY,
    [0, 80],
    ["rgba(255,255,255,0)", "rgba(255,255,255,0.08)"],
  );

  const visibleLinks = isPlay
    ? navLinks.filter(
        (l) => l.label === "Play" || l.label === "How it works" || l.label === "FAQ",
      )
    : navLinks;

  return (
    <motion.header
      style={{
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        backgroundColor: bg,
        borderBottomColor: borderColor,
      }}
      className="fixed inset-x-0 top-0 z-50 border-b"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-400 via-amber-400 to-rose-400">
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
          {visibleLinks.map((link) => (
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
          <AnimatePresence mode="wait">
            {isPlay ? (
              <motion.div
                key="nav-play"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => setMode("manage")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-300 transition hover:border-white/25 hover:text-white"
                >
                  <Crown size={14} className="text-amber-300" />I own a venue
                </button>
                <Link
                  href="#venues"
                  className="group relative overflow-hidden rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <Gamepad2 size={14} /> Find a venue
                  </span>
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="nav-manage"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => setMode("play")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-300 transition hover:border-white/25 hover:text-white"
                >
                  <Gamepad2 size={14} className="text-cyan-300" /> I want to play
                </button>
                <Link
                  href="/login"
                  className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="group relative overflow-hidden rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
                >
                  <span className="relative z-10">List your venue</span>
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
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
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          {isPlay ? (
            <>
              <Link
                href="#venues"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-full bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-zinc-950"
              >
                Find a venue
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMode("manage");
                  setOpen(false);
                }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-center text-sm text-zinc-200"
              >
                I own a venue
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-center text-sm text-zinc-200"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="rounded-full bg-emerald-400 px-4 py-2 text-center text-sm font-semibold text-zinc-950"
              >
                List your venue
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </motion.header>
  );
}
