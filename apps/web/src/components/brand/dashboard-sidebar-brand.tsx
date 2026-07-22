"use client";

import Image from "next/image";
import { LocoraLogo } from "@/components/brand/locora-logo";
import { cn } from "@/lib/cn";

export function OurCsiLogo({
  className,
  markOnly = false,
}: {
  className?: string;
  /** Circular mark only — for tight spaces */
  markOnly?: boolean;
}) {
  if (markOnly) {
    return (
      <Image
        src="/brand/our-csi-mark.png"
        alt="OUR-CS"
        width={28}
        height={21}
        className={cn("h-5 w-auto object-contain", className)}
      />
    );
  }

  return (
    <Image
      src="/brand/our-csi.png"
      alt="OUR-CS Software"
      width={140}
      height={38}
      className={cn(
        "h-7 w-auto max-w-[9.5rem] object-contain object-left",
        className,
      )}
    />
  );
}

/**
 * Dashboard sidebar brand strip: Locora + powered-by OUR-CS.
 * Logo sits on a light plate so the navy wordmark stays readable on dark chrome.
 */
export function DashboardSidebarBrand({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <LocoraLogo
        href="/"
        size="sm"
        showTagline={false}
        tone="onDark"
        className="min-w-0"
      />
      <div
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.97] px-2.5 py-1.5 shadow-sm"
        title="Powered by OUR-CS Software"
      >
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Powered by
        </span>
        <OurCsiLogo className="h-6 max-w-[7.5rem]" />
      </div>
    </div>
  );
}
