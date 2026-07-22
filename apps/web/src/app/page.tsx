import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Locora — gaming floor operations",
  description:
    "Run billiard halls, PC/console lounges, bowling, and gaming venues — live floor, bookings, and play billing. Mixed venues welcome; restaurants contact us.",
};

/**
 * Owner-primary homepage. Guest discovery lives at `/venues`;
 * dedicated owner marketing also at `/for-venues`.
 */
export default function HomePage() {
  return <LandingPage />;
}
