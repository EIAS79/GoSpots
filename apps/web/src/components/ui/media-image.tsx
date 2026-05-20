"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { resolveMediaUrl } from "@/lib/media-url";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%2327272a' width='400' height='300'/%3E%3Ctext fill='%2371717a' font-family='system-ui' font-size='14' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E";

/** Uploaded venue media — plain img so API URLs on another port always work. */
export function MediaImage({
  src,
  alt = "",
  className,
  fill,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fill?: boolean;
}) {
  const url = resolveMediaUrl(src);
  const [failed, setFailed] = useState(false);

  if (!url) return null;

  const displayUrl = failed ? PLACEHOLDER : url;

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={displayUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displayUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
