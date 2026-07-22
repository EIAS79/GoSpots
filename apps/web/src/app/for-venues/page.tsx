import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "For gaming venue owners — Locora",
  description:
    "Floor ops for gaming venues — live map, reservations, play billing, and staff. Gaming-first signup; restaurant and hotel F&B via contact.",
};

/** Owner acquisition landing — distinct from guest discovery at `/venues`. */
export default function ForVenuesPage() {
  return <LandingPage />;
}
