"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { resolveMediaUrl } from "@/lib/media-url";
import { VENUE_PLACEHOLDER_SRC, venueCoverSrc } from "@/lib/venue-placeholder";

type VenueCoverImageProps = {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
};

export function VenueCoverImage({
  src,
  alt = "",
  className,
  sizes = "100vw",
  priority,
  fill = true,
  width,
  height,
}: VenueCoverImageProps) {
  const resolved = resolveMediaUrl(src);
  const initial = venueCoverSrc(src, resolved);
  const [imgSrc, setImgSrc] = useState(initial);

  const shared = {
    src: imgSrc,
    alt,
    priority,
    /** Data URIs and API-served media (other port / private IP in dev) must skip
     *  the Next optimizer — it rejects localhost upstreams. */
    unoptimized: true,
    onError: () => setImgSrc(VENUE_PLACEHOLDER_SRC),
    className: cn("object-cover", className),
  };

  if (fill) {
    return <Image {...shared} fill sizes={sizes} />;
  }

  return (
    <Image
      {...shared}
      width={width ?? 1200}
      height={height ?? 800}
      sizes={sizes}
    />
  );
}
