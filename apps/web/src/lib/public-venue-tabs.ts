import type { PublicVenueDetail } from "./shop-settings-client";

export type VenueTabId =
  | "overview"
  | "menu"
  | "activities"
  | "dining"
  | "reviews"
  | "book";

export type VenueTabDef = {
  id: VenueTabId;
  labelKey: string;
};

export function buildVenueTabs(venue: PublicVenueDetail): VenueTabDef[] {
  const tabs: VenueTabDef[] = [{ id: "overview", labelKey: "venue.tab.overview" }];

  if (venue.features?.hasMenu && venue.menu?.items.length) {
    tabs.push({ id: "menu", labelKey: "venue.tab.menu" });
  }
  if (venue.features?.hasGaming && venue.gamingOfferings?.length) {
    tabs.push({ id: "activities", labelKey: "venue.tab.activities" });
  }
  if (venue.features?.hasDigitalDining && venue.diningOfferings?.length) {
    tabs.push({ id: "dining", labelKey: "venue.tab.dining" });
  }

  if (
    venue.reviewsMode !== "DISABLED" &&
    (venue.showReviews || venue.canSubmitReview)
  ) {
    tabs.push({ id: "reviews", labelKey: "venue.tab.reviews" });
  }

  tabs.push({ id: "book", labelKey: "venue.tab.book" });

  return tabs;
}
