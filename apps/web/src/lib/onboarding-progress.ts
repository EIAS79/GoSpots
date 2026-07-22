import { toPublicVenuePath } from "./venue-dashboard";

export const ONBOARDING_STEP_COUNT = 10;

export type OnboardingProgress = {
  version: 1;
  /** Public venue slug (storage key). */
  venuePath: string;
  shopId: string | null;
  /** 0-based current step index. */
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  templateId: string | null;
  templateCategoryIds: string[];
  completedAt: string | null;
  dismissedBanner: boolean;
  startedAt: string;
};

function storageKey(venuePath: string) {
  return `locora.onboarding.v1.${toPublicVenuePath(venuePath)}`;
}

function emptyProgress(
  venuePath: string,
  shopId: string | null = null,
): OnboardingProgress {
  return {
    version: 1,
    venuePath: toPublicVenuePath(venuePath),
    shopId,
    currentStep: 0,
    completedSteps: [],
    skippedSteps: [],
    templateId: null,
    templateCategoryIds: [],
    completedAt: null,
    dismissedBanner: false,
    startedAt: new Date().toISOString(),
  };
}

export function readOnboardingProgress(
  venuePath: string,
): OnboardingProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(venuePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingProgress;
    if (parsed?.version !== 1 || typeof parsed.currentStep !== "number") {
      return null;
    }
    return {
      ...emptyProgress(venuePath, parsed.shopId ?? null),
      ...parsed,
      venuePath: toPublicVenuePath(venuePath),
      completedSteps: Array.isArray(parsed.completedSteps)
        ? parsed.completedSteps
        : [],
      skippedSteps: Array.isArray(parsed.skippedSteps)
        ? parsed.skippedSteps
        : [],
      templateCategoryIds: Array.isArray(parsed.templateCategoryIds)
        ? parsed.templateCategoryIds
        : [],
    };
  } catch {
    return null;
  }
}

export function writeOnboardingProgress(progress: OnboardingProgress) {
  if (typeof window === "undefined") return;
  const next = {
    ...progress,
    venuePath: toPublicVenuePath(progress.venuePath),
  };
  window.localStorage.setItem(storageKey(next.venuePath), JSON.stringify(next));
}

/** Start or resume — does not reset an existing incomplete flow. */
export function ensureOnboardingProgress(
  venuePath: string,
  shopId: string | null = null,
): OnboardingProgress {
  const existing = readOnboardingProgress(venuePath);
  if (existing) {
    if (shopId && !existing.shopId) {
      const patched = { ...existing, shopId };
      writeOnboardingProgress(patched);
      return patched;
    }
    return existing;
  }
  const created = emptyProgress(venuePath, shopId);
  writeOnboardingProgress(created);
  return created;
}

export function markStepComplete(
  progress: OnboardingProgress,
  stepIndex: number,
): OnboardingProgress {
  const completedSteps = Array.from(
    new Set([...progress.completedSteps, stepIndex]),
  ).sort((a, b) => a - b);
  const skippedSteps = progress.skippedSteps.filter((s) => s !== stepIndex);
  const next: OnboardingProgress = {
    ...progress,
    completedSteps,
    skippedSteps,
    currentStep: Math.min(stepIndex + 1, ONBOARDING_STEP_COUNT - 1),
  };
  writeOnboardingProgress(next);
  return next;
}

export function markStepSkipped(
  progress: OnboardingProgress,
  stepIndex: number,
): OnboardingProgress {
  const skippedSteps = Array.from(
    new Set([...progress.skippedSteps, stepIndex]),
  ).sort((a, b) => a - b);
  const next: OnboardingProgress = {
    ...progress,
    skippedSteps,
    currentStep: Math.min(stepIndex + 1, ONBOARDING_STEP_COUNT - 1),
  };
  writeOnboardingProgress(next);
  return next;
}

export function finishOnboarding(
  progress: OnboardingProgress,
): OnboardingProgress {
  const next: OnboardingProgress = {
    ...progress,
    completedAt: new Date().toISOString(),
    dismissedBanner: true,
    currentStep: ONBOARDING_STEP_COUNT - 1,
    completedSteps: Array.from(
      { length: ONBOARDING_STEP_COUNT },
      (_, i) => i,
    ),
  };
  writeOnboardingProgress(next);
  return next;
}

export function dismissOnboardingBanner(progress: OnboardingProgress) {
  const next = { ...progress, dismissedBanner: true };
  writeOnboardingProgress(next);
  return next;
}

export function countedDoneSteps(progress: OnboardingProgress): number {
  const set = new Set([
    ...progress.completedSteps,
    ...progress.skippedSteps,
  ]);
  return set.size;
}

export function isOnboardingIncomplete(
  progress: OnboardingProgress | null,
): boolean {
  return Boolean(progress && !progress.completedAt);
}

export function shouldShowOnboardingBanner(
  progress: OnboardingProgress | null,
): boolean {
  return Boolean(
    progress && !progress.completedAt && !progress.dismissedBanner,
  );
}
