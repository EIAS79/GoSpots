"use client";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { useVenuePath } from "@/lib/venue-context";

export default function OnboardingPage() {
  const venuePath = useVenuePath();
  return <OnboardingWizard venuePath={venuePath} />;
}
