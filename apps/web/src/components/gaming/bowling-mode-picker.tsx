"use client";

import type { BowlingModeDefinition } from "@/lib/bowling-modes";

export function BowlingModePicker({
  modes,
  value,
  onChange,
  label = "Booking mode",
  className = "mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white",
  labelClassName = "block text-xs text-zinc-500",
}: {
  modes: BowlingModeDefinition[];
  value: string;
  onChange: (modeId: string) => void;
  label?: string;
  className?: string;
  labelClassName?: string;
}) {
  if (modes.length === 0) return null;

  if (modes.length === 1) {
    return (
      <p className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-400">
        {label}: <span className="text-zinc-200">{modes[0].name}</span>
      </p>
    );
  }

  return (
    <label className={labelClassName}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        {modes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.name}
          </option>
        ))}
      </select>
    </label>
  );
}
