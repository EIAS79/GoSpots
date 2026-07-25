"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock3, Star, X } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { cn } from "@/lib/cn";
import {
  getPublicMenuItemAvailability,
  type PublicMenuAvailability,
} from "@/lib/menu-timing";
import { resolveMediaUrl } from "@/lib/media-url";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type {
  PublicMenuItem,
  PublicMenuSection,
} from "@/lib/shop-settings-client";

export function VenueMenuItemModal({
  item,
  section,
  currency,
  reviewsMode = "ENABLED",
  onClose,
}: {
  item: PublicMenuItem;
  section: PublicMenuSection | null;
  currency: string;
  locale?: string;
  reviewsMode?: "ENABLED" | "DISABLED" | "HIDDEN";
  onClose: () => void;
}) {
  const { formatMoney, t } = usePublicPrefs();
  const images = [item.imageUrl, item.imageUrl2]
    .map((url) => resolveMediaUrl(url))
    .filter((url): url is string => Boolean(url));

  const availability = getPublicMenuItemAvailability(item, section, { t });
  const formatPrice = (n: import("@/lib/money").MoneyWire) =>
    formatMoney(n, currency);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <ModalPortal>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[400] flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm dark:bg-black/65"
            onClick={onClose}
          />
          <motion.article
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-item-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "relative z-10 flex w-full max-w-md flex-col overflow-hidden",
              "max-h-[min(82dvh,34rem)] rounded-t-2xl border border-[var(--color-border)]",
              "bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-xl",
              "dark:border-white/10 dark:bg-zinc-950 sm:rounded-2xl",
            )}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-2.5 top-2.5 z-20 grid h-8 w-8 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/90 text-zinc-600 shadow-sm backdrop-blur dark:text-zinc-300"
            >
              <X size={14} />
            </button>

            {/* Images: single compact, or 2-up grid */}
            {images.length === 0 ? (
              <div className="h-24 shrink-0 bg-gradient-to-br from-emerald-500/10 via-zinc-200/40 to-transparent dark:via-zinc-900" />
            ) : images.length === 1 ? (
              <div className="relative aspect-[2/1] max-h-36 w-full shrink-0 overflow-hidden bg-zinc-900">
                <Image
                  src={images[0]!}
                  alt={item.name}
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
              </div>
            ) : (
              <div className="grid shrink-0 grid-cols-2 gap-0.5 bg-[var(--color-border)]">
                {images.slice(0, 2).map((url) => (
                  <div
                    key={url}
                    className="relative aspect-[4/3] max-h-32 overflow-hidden bg-zinc-900"
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                      priority
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3.5">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <h2
                    id="menu-item-title"
                    className="truncate text-lg font-semibold tracking-tight"
                  >
                    {item.name}
                  </h2>
                  {section ? (
                    <p className="mt-0.5 text-xs text-zinc-500">{section.name}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatPrice(item.price)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <MenuAvailabilityPill
                  availability={availability}
                  variant="auto"
                  className="gap-1 px-1.5 py-0.5 text-[10px]"
                />
                {availability.schedule ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                    <Clock3 size={10} className="opacity-70" />
                    {availability.schedule}
                  </span>
                ) : null}
              </div>

              {item.description ? (
                <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                  {item.description}
                </p>
              ) : null}

              {item.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium dark:border-white/10"
                      style={{
                        borderColor: tag.color ? `${tag.color}55` : undefined,
                        color: tag.color ?? undefined,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              ) : null}

              {reviewsMode !== "DISABLED" ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2.5 dark:border-white/10">
                  <div className="flex items-center gap-1.5">
                    <Star size={12} className="text-amber-500/70" />
                    <p className="text-xs font-medium">Venue reviews</p>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                    Guest ratings are on the Reviews tab — not per menu item.
                  </p>
                </div>
              ) : null}
            </div>
          </motion.article>
        </motion.div>
      </AnimatePresence>
    </ModalPortal>
  );
}

export function MenuAvailabilityPill({
  availability,
  className,
  variant = "dark",
}: {
  availability: PublicMenuAvailability;
  className?: string;
  variant?: "dark" | "light" | "auto";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        variant === "dark" &&
          availability.tone === "available" &&
          "border-emerald-400/35 bg-emerald-950/80 text-emerald-300",
        variant === "dark" &&
          availability.tone === "later" &&
          "border-amber-400/35 bg-amber-950/80 text-amber-300",
        variant === "dark" &&
          availability.tone === "sold-out" &&
          "border-rose-400/35 bg-rose-950/80 text-rose-300",
        variant === "dark" &&
          availability.tone === "closed" &&
          "border-[var(--color-border)] bg-[var(--color-background)]/80 text-zinc-600 dark:border-white/10 dark:text-zinc-400",
        variant === "light" &&
          availability.tone === "available" &&
          "border-emerald-300 bg-emerald-50 text-emerald-800",
        variant === "light" &&
          availability.tone === "later" &&
          "border-amber-300 bg-amber-50 text-amber-900",
        variant === "light" &&
          availability.tone === "sold-out" &&
          "border-rose-300 bg-rose-50 text-rose-800",
        variant === "light" &&
          availability.tone === "closed" &&
          "border-stone-200 bg-stone-100 text-stone-600",
        variant === "auto" &&
          availability.tone === "available" &&
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
        variant === "auto" &&
          availability.tone === "later" &&
          "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
        variant === "auto" &&
          availability.tone === "sold-out" &&
          "border-rose-500/25 bg-rose-500/10 text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200",
        variant === "auto" &&
          availability.tone === "closed" &&
          "border-[var(--color-border)] bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-400",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          availability.tone === "available" &&
            "bg-emerald-500 dark:bg-emerald-400",
          availability.tone === "later" && "bg-amber-500 dark:bg-amber-400",
          availability.tone === "sold-out" && "bg-rose-500 dark:bg-rose-400",
          availability.tone === "closed" && "bg-zinc-400",
        )}
      />
      {availability.headline}
    </span>
  );
}
