"use client";

import Link from "next/link";
import { LocoraLogo as GoSpotsLogo } from "@/components/brand/locora-logo";
import { OurCsiLogo } from "@/components/brand/dashboard-sidebar-brand";
import { BRAND_TAGLINE } from "@/lib/brand";
import { usePublicPrefs } from "@/lib/public-prefs-context";

type FooterLink = { label: string; href: string; external?: boolean };

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
    { label: t("footer.contact"), href: "mailto:hello@gospots.eu", external: true },
    { label: t("footer.privacy"), href: "/privacy" },
    { label: t("footer.terms"), href: "/terms" },
  ];

  const sections: { title: string; links: FooterLink[] }[] = [
    { title: t("footer.product"), links: productLinks },
    { title: t("footer.forGuests"), links: guestLinks },
    { title: t("footer.company"), links: companyLinks },
  ];

  return (
    <footer className="relative border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:px-8">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <GoSpotsLogo href="/" size="lg" showTagline />
            <p className="mt-4 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
              {BRAND_TAGLINE} — {t("footer.blurb")}
            </p>
          </div>

          {sections.map((s) => (
            <div key={s.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {s.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {s.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        className="text-sm text-zinc-700 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-zinc-700 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6 text-xs text-zinc-500 dark:border-white/5 md:flex-row">
          <p className="inline-flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium tracking-wide">{t("footer.poweredBy")}</span>
            <OurCsiLogo className="h-3.5 max-w-[5rem] opacity-90 dark:brightness-125 dark:contrast-110" />
          </p>
          <p>
            © {new Date().getFullYear()} GoSpots. {t("footer.rights")}
          </p>
          <p className="text-center md:text-right">
            {t("footer.builtWith")}{" "}
            <span className="text-emerald-700 dark:text-emerald-400">
              {t("footer.busyNights")}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
