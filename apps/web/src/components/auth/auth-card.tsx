"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-xl"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      <p className="mt-1.5 text-sm text-zinc-400">{subtitle}</p>
      <div className="mt-7">{children}</div>
      {footer && (
        <p className="mt-7 text-center text-sm text-zinc-500">{footer}</p>
      )}
    </motion.div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-center justify-between text-zinc-400">
        <span>{label}</span>
        {hint && <span className="text-[11px] text-zinc-600">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </label>
  );
}
