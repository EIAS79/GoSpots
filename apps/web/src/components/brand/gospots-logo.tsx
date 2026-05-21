import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

const sizes = {
  sm: { box: 28, img: 28, text: "text-sm", tagline: "text-[10px]" },
  md: { box: 32, img: 32, text: "text-sm", tagline: "text-xs" },
  lg: { box: 40, img: 40, text: "text-base", tagline: "text-sm" },
} as const;

type Size = keyof typeof sizes;

export function GoSpotsLogo({
  size = "md",
  showName = true,
  showTagline = false,
  href,
  className,
}: {
  size?: Size;
  showName?: boolean;
  showTagline?: boolean;
  href?: string;
  className?: string;
}) {
  const s = sizes[size];
  const inner = (
    <>
      <span
        className={cn(
          "relative shrink-0 overflow-hidden rounded-lg shadow-[0_0_20px_rgba(251,191,36,0.25)]",
        )}
        style={{ width: s.box, height: s.box }}
      >
        <Image
          src={BRAND_LOGO_SRC}
          alt=""
          width={s.img}
          height={s.img}
          className="h-full w-full object-contain"
          priority={size === "lg"}
        />
      </span>
      {(showName || showTagline) && (
        <span className="flex min-w-0 flex-col leading-tight">
          {showName && (
            <span className={cn("font-semibold tracking-tight text-white", s.text)}>
              {BRAND_NAME}
            </span>
          )}
          {showTagline && (
            <span className={cn("text-zinc-400", s.tagline)}>{BRAND_TAGLINE}</span>
          )}
        </span>
      )}
    </>
  );

  const classes = cn("inline-flex items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} className={cn(classes, "transition hover:opacity-90")}>
        {inner}
      </Link>
    );
  }

  return <span className={classes}>{inner}</span>;
}
