"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock3, Star, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
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
  const [activeImage, setActiveImage] = useState(0);

  const availability = getPublicMenuItemAvailability(item, section, { t });
  const formatPrice = (n: import("@/lib/money").MoneyWire) => formatMoney(n, currency);

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

  useEffect(() => {
    setActiveImage(0);
  }, [item.id]);

  return (
    <ModalPortal>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.article
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-item-title"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-stone-200/90 bg-[#faf8f5] text-stone-900 shadow-2xl sm:max-h-[min(94vh,820px)] sm:rounded-3xl"
          >
            <div className="relative aspect-[16/10] max-h-[40vh] w-full shrink-0 overflow-hidden bg-zinc-900 sm:aspect-[16/9] sm:max-h-none">
              {images.length > 0 ? (
                <Image
                  src={images[activeImage] ?? images[0]}
                  alt={item.name}
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-white/90 text-stone-700 shadow-md backdrop-blur-md transition hover:bg-white"
              >
                <X size={18} />
              </button>
              {images.length > 1 ? (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
                  {images.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      className={cn(
                        "relative h-12 w-12 overflow-hidden rounded-lg border-2 transition",
                        i === activeImage
                          ? "border-amber-400"
                          : "border-white/20 opacity-80 hover:opacity-100",
                      )}
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="menu-item-title"
                    className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl"
                  >
                    {item.name}
                  </h2>
                  {section ? (
                    <p className="mt-1 text-sm text-stone-500">{section.name}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums text-amber-600 sm:text-3xl">
                  {formatPrice(item.price)}
                </p>
              </div>

              <AvailabilityBlock
                availability={availability}
                variant="light"
                className="mt-5"
              />

              {item.description ? (
                <p className="mt-5 text-base leading-relaxed text-stone-600">
                  {item.description}
                </p>
              ) : null}

              {item.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm"
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
                <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-100/80 px-4 py-5">
                  <div className="flex items-center gap-2">
                    <Star size={18} className="text-amber-500/70" />
                    <p className="text-sm font-medium text-stone-800">
                      Venue reviews
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    Guest ratings for the venue are on the Reviews tab — not
                    per menu item.
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
  variant?: "dark" | "light";
}) {
  const light = variant === "light";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        !light &&
          availability.tone === "available" &&
          "border-emerald-400/35 bg-emerald-950/80 text-emerald-300",
        !light &&
          availability.tone === "later" &&
          "border-amber-400/35 bg-amber-950/80 text-amber-300",
        !light &&
          availability.tone === "sold-out" &&
          "border-rose-400/35 bg-rose-950/80 text-rose-300",
        !light &&
          availability.tone === "closed" &&
          "border-white/10 bg-zinc-950/80 text-zinc-400",
        light &&
          availability.tone === "available" &&
          "border-emerald-300 bg-emerald-50 text-emerald-800",
        light &&
          availability.tone === "later" &&
          "border-amber-300 bg-amber-50 text-amber-900",
        light &&
          availability.tone === "sold-out" &&
          "border-rose-300 bg-rose-50 text-rose-800",
        light &&
          availability.tone === "closed" &&
          "border-stone-200 bg-stone-100 text-stone-600",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          availability.tone === "available" && "bg-emerald-400",
          availability.tone === "later" && "bg-amber-400",
          availability.tone === "sold-out" && "bg-rose-400",
          availability.tone === "closed" && "bg-zinc-500",
        )}
      />
      {availability.headline}
    </span>
  );
}

function AvailabilityBlock({
  availability,
  className,
  variant = "dark",
}: {
  availability: PublicMenuAvailability;
  className?: string;
  variant?: "dark" | "light";
}) {
  const light = variant === "light";
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5",
        !light &&
          availability.tone === "available" &&
          "border-emerald-400/20 bg-emerald-500/[0.07]",
        !light &&
          availability.tone === "later" &&
          "border-amber-400/20 bg-amber-500/[0.07]",
        !light &&
          availability.tone === "sold-out" &&
          "border-rose-400/20 bg-rose-500/[0.07]",
        !light &&
          availability.tone === "closed" &&
          "border-white/10 bg-zinc-900/50",
        light &&
          availability.tone === "available" &&
          "border-emerald-200 bg-emerald-50",
        light &&
          availability.tone === "later" &&
          "border-amber-200 bg-amber-50",
        light &&
          availability.tone === "sold-out" &&
          "border-rose-200 bg-rose-50",
        light &&
          availability.tone === "closed" &&
          "border-stone-200 bg-stone-100",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Clock3
          size={18}
          className={cn(
            "mt-0.5 shrink-0",
            availability.tone === "available" &&
              (light ? "text-emerald-600" : "text-emerald-400"),
            availability.tone === "later" &&
              (light ? "text-amber-600" : "text-amber-400"),
            availability.tone === "sold-out" &&
              (light ? "text-rose-600" : "text-rose-400"),
            availability.tone === "closed" &&
              (light ? "text-stone-500" : "text-zinc-500"),
          )}
        />
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              light ? "text-stone-900" : "text-zinc-100",
            )}
          >
            {availability.headline}
          </p>
          <p
            className={cn(
              "mt-1 text-sm",
              light ? "text-stone-600" : "text-zinc-400",
            )}
          >
            {availability.schedule}
          </p>
        </div>
      </div>
    </div>
  );
}
