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
  label: string;
};

export function buildVenueTabs(venue: PublicVenueDetail): VenueTabDef[] {
  const tabs: VenueTabDef[] = [{ id: "overview", label: "Overview" }];

  if (venue.features?.hasMenu && venue.menu?.items.length) {
    tabs.push({ id: "menu", label: "Menu" });
  }
  if (venue.features?.hasGaming && venue.gamingOfferings?.length) {
    tabs.push({ id: "activities", label: "Gaming floor" });
  }
  if (venue.features?.hasDigitalDining && venue.diningOfferings?.length) {
    tabs.push({ id: "dining", label: "Book a table" });
  }

  if (
    venue.reviewsMode !== "DISABLED" &&
    (venue.showReviews || venue.canSubmitReview)
  ) {
    tabs.push({ id: "reviews", label: "Reviews" });
  }

  tabs.push({ id: "book", label: "Reserve" });

  return tabs;
}
