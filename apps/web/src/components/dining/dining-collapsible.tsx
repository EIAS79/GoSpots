"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function DiningCollapsible({
  title,
  meta,
  badge,
  defaultOpen = false,
  forceOpen = false,
  className,
  triggerClassName,
  children,
  trailing,
}: {
  title: string;
  meta?: string;
  badge?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const panelId = useId();
  const isOpen = forceOpen || open;

  return (
    <section className={cn("dining-panel", className)}>
      <div className="dining-panel__header">
        <button
          type="button"
          id={`${panelId}-trigger`}
          aria-expanded={isOpen}
          aria-controls={`${panelId}-body`}
          onClick={() => {
            if (forceOpen) return;
            setOpen((v) => !v);
          }}
          className={cn(
            "dining-panel__trigger",
            isOpen && "dining-panel__trigger--open",
            triggerClassName,
          )}
        >
          <div className="dining-panel__trigger-text min-w-0">
            <p className="dining-panel__title">{title}</p>
            {meta ? <p className="dining-panel__meta truncate">{meta}</p> : null}
          </div>
          {badge ? <span className="dining-panel__badge">{badge}</span> : null}
          {!forceOpen ? (
            <ChevronDown
              size={18}
              aria-hidden
              className={cn(
                "dining-panel__chevron",
                isOpen && "dining-panel__chevron--open",
              )}
            />
          ) : null}
        </button>
        {trailing ? (
          <div className="dining-panel__actions">{trailing}</div>
        ) : null}
      </div>
      <div
        id={`${panelId}-body`}
        role="region"
        aria-labelledby={`${panelId}-trigger`}
        hidden={!isOpen}
        className={cn("dining-panel__body", !isOpen && "dining-panel__body--closed")}
      >
        {children}
      </div>
    </section>
  );
}
