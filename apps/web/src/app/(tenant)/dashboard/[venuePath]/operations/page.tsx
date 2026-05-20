"use client";

import Link from "next/link";
import { CalendarRange, Gamepad2, ShoppingCart, Wallet } from "lucide-react";
import { TenantPage } from "@/components/layout/tenant-page";
import { useVenueHref } from "@/lib/venue-context";

export default function OperationsPage() {
  const reservationsHref = useVenueHref("/sessions");
  const ordersHref = useVenueHref("/orders");
  const playHref = useVenueHref("/play-billing");
  const gamesHref = useVenueHref("/resources");
  const financeHref = useVenueHref("/finance");

  return (
    <TenantPage
      title="Operations"
      description="Day-to-day floor work — bookings, kitchen tickets, and game charges. Money totals roll up in Finance."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <Link
          href={reservationsHref}
          className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 transition hover:border-emerald-400/30"
        >
          <CalendarRange className="mb-3 text-emerald-400" size={28} />
          <h2 className="font-semibold text-white">Reservations</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Dining seating, game bookings, and the day schedule — not menu tickets.
          </p>
        </Link>
        <Link
          href={ordersHref}
          className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 transition hover:border-emerald-400/30"
        >
          <ShoppingCart className="mb-3 text-amber-400" size={28} />
          <h2 className="font-semibold text-white">Menu orders</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Kitchen / bar tickets from your menu — preparing, handed off, archived.
          </p>
        </Link>
        <Link
          href={playHref}
          className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 transition hover:border-emerald-400/30"
        >
          <Gamepad2 className="mb-3 text-sky-400" size={28} />
          <h2 className="font-semibold text-white">Play billing</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Mark game reservations paid — amounts auto-calc from Gaming setup rates.
          </p>
        </Link>
        <Link
          href={gamesHref}
          className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 transition hover:border-emerald-400/30"
        >
          <Gamepad2 className="mb-3 text-violet-400" size={28} />
          <h2 className="font-semibold text-white">Gaming setup</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Categories, units, photos, and pricing for what guests book.
          </p>
        </Link>
      </div>
      <p className="text-center text-xs text-zinc-600">
        Revenue reports and losses →{" "}
        <Link href={financeHref} className="text-emerald-400/90 underline">
          Finance
        </Link>
        <Wallet className="ml-1 inline size-3.5 align-text-bottom opacity-70" />
      </p>
    </TenantPage>
  );
}
