import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "GoSpots — host every location",
  description:
    "Run gaming venues, restaurants, bars, hotel F&B, and mixed entertainment — dashboard, public site, bookings, menu, and play billing.",
};

/**
 * Owner-primary homepage. Guest discovery lives at `/venues`;
 * dedicated owner marketing also at `/for-venues`.
 */
export default function HomePage() {
  return <LandingPage />;
}
