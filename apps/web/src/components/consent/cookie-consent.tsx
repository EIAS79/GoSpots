"use client";

import { useEffect, useState } from "react";
import { updateGoogleConsent } from "@/lib/analytics";

type Consent = { analytics: boolean; marketing: boolean };
const STORAGE_KEY = "gospots_cookie_consent_v1";

function apply(consent: Consent) {
  updateGoogleConsent(consent);
  window.dispatchEvent(new CustomEvent("gospots:consent", { detail: consent }));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setVisible(true);
      return;
    }
    try {
      apply(JSON.parse(saved) as Consent);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setVisible(true);
    }
  }, []);

  function choose(consent: Consent) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    apply(consent);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl sm:p-5" aria-label="Cookie preferences">
      <p className="font-semibold">Privacy preferences</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Necessary storage keeps GoSpots working. Analytics helps us understand usage; marketing storage supports advertising measurement. You can reject optional storage.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium" onClick={() => choose({ analytics: false, marketing: false })}>Reject optional</button>
        <button className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium" onClick={() => choose({ analytics: true, marketing: false })}>Analytics only</button>
        <button className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950" onClick={() => choose({ analytics: true, marketing: true })}>Accept all</button>
      </div>
    </aside>
  );
}
