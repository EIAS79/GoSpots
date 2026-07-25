"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { GoSpotsBrandLockup } from "@/components/brand/gospots-brand-lockup";
import { OurCsiLogo } from "@/components/brand/dashboard-sidebar-brand";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { usePublicPrefs } from "@/lib/public-prefs-context";

type FooterLink = { label: string; href: string; external?: boolean };

function FooterTextLink({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-zinc-400 transition-colors duration-150 hover:text-white";

  if (link.external) {
    return (
      <a href={link.href} className={`inline-flex items-center gap-0.5 ${className}`}>
        {link.label}
        <ArrowUpRight size={12} className="opacity-60" aria-hidden />
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/**
 * Closing composition — brand mantra dominates; nav is horizontal ribbons
 * (not a classic column sitemap); meta is one quiet strip.
 */
export function Footer() {
  const { t } = usePublicPrefs();

  const productLinks: FooterLink[] = [
    { label: t("footer.operations"), href: "#features" },
    { label: t("footer.sessions"), href: "#features" },
    { label: t("footer.billing"), href: "#features" },
    { label: t("footer.reports"), href: "#features" },
    { label: t("footer.forVenues"), href: "/for-venues" },
  ];

  const guestLinks: FooterLink[] = [
    { label: t("footer.findSpot"), href: "/venues" },
    { label: t("footer.reservations"), href: "/venues" },
  ];

  const companyLinks: FooterLink[] = [
    { label: t("footer.pricing"), href: "#pricing" },
    { label: t("footer.faq"), href: "#faq" },
    {
      label: t("footer.contact"),
      href: "mailto:support@gospots.eu",
      external: true,
    },
    { label: t("footer.privacy"), href: "/privacy" },
    { label: t("footer.terms"), href: "/terms" },
  ];

  const ribbons: { title: string; links: FooterLink[] }[] = [
    { title: t("footer.product"), links: productLinks },
    { title: t("footer.forGuests"), links: guestLinks },
    { title: t("footer.company"), links: companyLinks },
  ];

  return (
    <footer className="relative isolate overflow-hidden bg-[#050507] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-20%,rgba(251,191,36,0.14),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(52,211,153,0.10),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:px-8 md:py-20">
        {/* Brand close */}
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <GoSpotsBrandLockup href="/" size="lg" tone="onDark" />
            <p className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl md:leading-[1.1]">
              {BRAND_TAGLINE}
            </p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
              {t("footer.blurb")}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
            >
              {t("cta.manage.primary")}
            </Link>
            <Link
              href="/venues"
              className="inline-flex items-center justify-center gap-1 text-sm text-zinc-400 transition hover:text-white"
            >
              {t("footer.findSpot")}
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        </div>

        {/* Horizontal link ribbons */}
        <div className="mt-14 space-y-5 border-t border-white/10 pt-10">
          {ribbons.map((row) => (
            <div
              key={row.title}
              className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8"
            >
              <p className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                {row.title}
              </p>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                {row.links.map((l, i) => (
                  <span key={`${row.title}-${l.label}`} className="inline-flex items-center">
                    {i > 0 && (
                      <span
                        className="mx-2.5 text-zinc-600 select-none"
                        aria-hidden
                      >
                        ·
                      </span>
                    )}
                    <FooterTextLink link={l} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Meta */}
        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-2">
              <span className="tracking-[0.14em] uppercase">
                {t("footer.poweredBy")}
              </span>
              <OurCsiLogo className="h-3.5 max-w-[4.75rem] brightness-125 contrast-110" />
            </span>
            <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />
            <span>
              © {new Date().getFullYear()} {BRAND_NAME}. {t("footer.rights")}
            </span>
            <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />
            <a
              href="mailto:support@gospots.eu"
              className="transition hover:text-zinc-300"
            >
              support@gospots.eu
            </a>
          </div>
          <p className="text-[11px] text-zinc-500">
            {t("footer.builtWith")}{" "}
            <span className="text-emerald-400">{t("footer.busyNights")}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
