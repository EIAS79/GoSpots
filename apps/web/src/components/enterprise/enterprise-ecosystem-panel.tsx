"use client";

import Link from "next/link";
import { useVenueHref } from "@/lib/venue-context";

export function EnterpriseEcosystemPanel() {
  const organizationHref = useVenueHref("/organization");
  const integrationsHref = useVenueHref("/integrations");
  const hardwareHref = useVenueHref("/hardware");

  const cards = [
    {
      href: organizationHref,
      title: "Organization & locations",
      description: "Group venues, control organization access, and compare location revenue.",
    },
    {
      href: integrationsHref,
      title: "Integrations",
      description: "Manage connector installations, API credentials, webhooks, mappings, and retry queues.",
    },
    {
      href: hardwareHref,
      title: "Hardware & printing",
      description: "Configure printers, print routes, customer displays, and barcode aliases.",
    },
  ];

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-100">Enterprise ecosystem</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Multi-location, integrations, and venue hardware are isolated behind their own management surfaces.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-white/10 bg-zinc-950/40 p-3 transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
          >
            <div className="text-sm font-medium text-zinc-100">{card.title}</div>
            <div className="mt-1 text-xs leading-5 text-zinc-500">{card.description}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
