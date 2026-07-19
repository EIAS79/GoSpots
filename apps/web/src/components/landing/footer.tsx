"use client";

import Link from "next/link";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { BRAND_TAGLINE } from "@/lib/brand";
import { useMode } from "./mode-context";

type FooterLink = { label: string; href: string; external?: boolean };

export function Footer() {
  const { mode } = useMode();
  const isPlay = mode === "play";

  const productLinks: FooterLink[] = isPlay
    ? [
        { label: "Find a spot", href: "/venues" },
        { label: "Directory", href: "#venues" },
        { label: "FAQ", href: "#faq" },
      ]
    : [
        { label: "Operations", href: "#features" },
        { label: "Sessions", href: "#features" },
        { label: "Billing", href: "#features" },
        { label: "Reports", href: "#features" },
      ];

  const guestLinks: FooterLink[] = [
    { label: "Find a spot", href: "/venues" },
    { label: "Reservations", href: "/venues" },
  ];

  const companyLinks: FooterLink[] = [
    ...(isPlay ? [] : [{ label: "Pricing", href: "#pricing" }]),
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "mailto:hello@gospots.app", external: true },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];

  const sections: { title: string; links: FooterLink[] }[] = [
    { title: isPlay ? "Explore" : "Product", links: productLinks },
    { title: "For guests", links: guestLinks },
    { title: "Company", links: companyLinks },
  ];

  return (
    <footer className="relative border-t border-[var(--color-border)] bg-[var(--color-surface)] dark:border-white/5 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:px-8">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <GoSpotsLogo href="/" size="md" showTagline />
            <p className="mt-4 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
              {BRAND_TAGLINE} — billiard halls, gaming lounges, and entertainment
              venues near you. Owners run nights from one realtime dashboard.
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
          <p>© {new Date().getFullYear()} GoSpots. All rights reserved.</p>
          <p>
            Built with Next.js · NestJS · PostgreSQL ·{" "}
            <span className="text-emerald-700 dark:text-emerald-400">
              made for busy nights
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
