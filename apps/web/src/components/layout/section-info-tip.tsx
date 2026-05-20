"use client";

import { CircleCheck, Info } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function SectionInfoTip({
  description,
  capabilities,
}: {
  description?: string;
  capabilities?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const hasHelp =
    Boolean(description) || Boolean(capabilities && capabilities.length > 0);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelWidth = Math.min(720, window.innerWidth - 24);
    let left = r.left;
    if (left + panelWidth > window.innerWidth - 12) {
      left = window.innerWidth - panelWidth - 12;
    }
    setCoords({ top: r.bottom + 8, left: Math.max(12, left) });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updatePosition]);

  if (!hasHelp) return null;

  const panel =
    open && mounted ?
      createPortal(
        <div
          id={id}
          role="tooltip"
          className="fixed z-[300] w-[min(720px,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-zinc-950/98 p-4 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md"
          style={{ top: coords.top, left: coords.left }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {description ? (
            <p className="text-xs leading-relaxed text-zinc-400">{description}</p>
          ) : null}
          {capabilities && capabilities.length > 0 ? (
            <div className={cn(description && "mt-3 border-t border-white/10 pt-3")}>
              <p className="mb-2 text-[11px] font-medium text-zinc-300">
                What you can do here
              </p>
              <ul className="flex flex-wrap gap-2">
                {capabilities.map((item) => (
                  <li
                    key={item}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] leading-snug text-zinc-400"
                  >
                    <CircleCheck
                      size={12}
                      className="shrink-0 text-emerald-500/80"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-500 transition",
          "hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-300",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/50",
          open && "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
        )}
        aria-label="About this section"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => {
          updatePosition();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          updatePosition();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      >
        <Info size={15} strokeWidth={2} />
      </button>
      {panel}
    </>
  );
}
