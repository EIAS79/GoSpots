"use client";

import type { ReactNode } from "react";

/**
 * Shared Art. 7 notice checkbox for public guest forms.
 * Callers pass a pre-translated `label` (e.g. `t("venuePage.privacyConsent.label")`).
 */
export function PrivacyConsentCheckbox({
  checked,
  onChange,
  label,
  id = "privacy-consent",
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 text-xs leading-snug text-zinc-600 dark:text-zinc-400"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-[var(--color-border)] bg-[var(--color-background)] text-amber-500 focus:ring-amber-500/40 dark:border-white/20 dark:bg-zinc-900"
      />
      <span>{label}</span>
    </label>
  );
}
