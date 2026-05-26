import type { Metadata } from "next";
import { VenuesDiscovery } from "@/components/venues/venues-discovery";

export const metadata: Metadata = {
  title: "Find your next spot — GoSpots",
  description:
    "Discover gaming centers, lounges, bars, and entertainment venues worldwide on GoSpots.",
};

export default function VenuesPage() {
  return <VenuesDiscovery />;
}
