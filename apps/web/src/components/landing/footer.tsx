import Link from "next/link";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { BRAND_TAGLINE } from "@/lib/brand";

function IconX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconGithub(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.07 3.29 9.37 7.86 10.89.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .97-.31 3.17 1.17a11 11 0 0 1 2.88-.39c.98 0 1.97.13 2.88.39 2.2-1.48 3.17-1.17 3.17-1.17.62 1.57.23 2.73.11 3.02.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.25 5.65.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.15 0 .31.21.68.8.56C20.71 21.37 24 17.07 24 12c0-6.35-5.15-11.5-12-11.5z" />
    </svg>
  );
}

function IconLinkedin(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.27 2.38 4.27 5.47v6.27ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm-1.78 13.02h3.55V9H3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0Z" />
    </svg>
  );
}

const sections = [
  {
    title: "Product",
    links: [
      { label: "Operations", href: "#features" },
      { label: "Sessions", href: "#features" },
      { label: "Billing", href: "#features" },
      { label: "Reports", href: "#features" },
    ],
  },
  {
    title: "For players",
    links: [
      { label: "Find a venue", href: "/venues" },
      { label: "Reservations", href: "/venues" },
      { label: "Loyalty", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: "#" },
      { label: "Status", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <GoSpotsLogo href="/" size="md" showTagline />
            <p className="mt-4 max-w-xs text-sm text-zinc-400">
              {BRAND_TAGLINE} — billiard halls, gaming lounges, and entertainment
              venues near you. Owners run nights from one realtime dashboard.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[IconX, IconGithub, IconLinkedin].map((Icon, i) => (
                <Link
                  key={i}
                  href="#"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:border-white/25 hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          </div>

          {sections.map((s) => (
            <div key={s.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {s.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {s.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-zinc-300 transition hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-xs text-zinc-500 md:flex-row">
          <p>© {new Date().getFullYear()} GoSpots. All rights reserved.</p>
          <p>
            Built with Next.js · NestJS · PostgreSQL ·{" "}
            <span className="text-emerald-400">made for busy nights</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
