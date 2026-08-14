import { api } from "./api";

export type OnboardingReadinessStep = {
  key: string;
  label: string;
  complete: boolean;
  status: "COMPLETE" | "OPTIONAL" | "REQUIRED";
  detail: string | null;
};

export type OnboardingReadiness = {
  phase: 2;
  operational: boolean;
  required: Record<string, boolean>;
  steps: OnboardingReadinessStep[];
  counts: Record<string, number>;
  checkedAt: string;
};

export function fetchOnboardingReadiness() {
  return api<OnboardingReadiness>("/shop/onboarding/readiness");
}
