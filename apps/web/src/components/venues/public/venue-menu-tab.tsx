"use client";

import { useState } from "react";
import { PublicMenuBoard } from "@/components/venues/public/public-menu-board";
import { VenueMenuItemModal } from "@/components/venues/public/venue-menu-item-modal";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type {
  PublicMenuItem,
  PublicMenuSection,
  PublicVenueDetail,
} from "@/lib/shop-settings-client";

export function VenueMenuTab({ venue }: { venue: PublicVenueDetail }) {
  const { formatMoney, t } = usePublicPrefs();
  const menu = venue.menu;
  const [selected, setSelected] = useState<{
    item: PublicMenuItem;
    section: PublicMenuSection | null;
  } | null>(null);

  const formatPrice = (n: import("@/lib/money").MoneyWire) => formatMoney(n, venue.currency);

  if (!menu?.items.length) {
    return <p className="text-sm text-zinc-500">{t("menu.notAvailable")}</p>;
  }

  return (
    <>
      <PublicMenuBoard
        sections={menu.sections}
        items={menu.items}
        formatPrice={formatPrice}
        onOpenItem={(item, section) => setSelected({ item, section })}
      />

      {selected ? (
        <VenueMenuItemModal
          item={selected.item}
          section={selected.section}
          currency={venue.currency}
          reviewsMode={venue.reviewsMode}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
