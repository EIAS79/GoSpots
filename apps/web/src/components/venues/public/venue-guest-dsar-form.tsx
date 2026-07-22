"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { PrivacyConsentCheckbox } from "@/components/venues/public/privacy-consent-checkbox";
import { submitPublicGuestDsar } from "@/lib/gdpr-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";

/** Guest self-serve DSAR form for a published venue page. */
export function VenueGuestDsarForm({ slug }: { slug: string }) {
  const { t } = usePublicPrefs();
  const [type, setType] = useState<"ACCESS" | "ERASURE">("ACCESS");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!guestEmail.trim()) {
      setError(t("venuePage.contact.replyRequired"));
      return;
    }
    if (!privacyConsent) {
      setError(t("venuePage.privacyConsent.required"));
      return;
    }
    setBusy(true);
    try {
      const res = await submitPublicGuestDsar(slug, {
        type,
        guestEmail: guestEmail.trim(),
        guestName: guestName.trim() || undefined,
        message: message.trim() || undefined,
        privacyConsentAccepted: true,
      });
      setSuccess(res.message || t("venuePage.dsar.success"));
      setGuestEmail("");
      setGuestName("");
      setMessage("");
      setPrivacyConsent(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("venuePage.dsar.failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
        {t("venuePage.dsar.title")}
      </h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">{t("venuePage.dsar.hint")}</p>
      <form className="mt-3 space-y-3" onSubmit={(e) => void onSubmit(e)}>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="dsar-type"
              checked={type === "ACCESS"}
              onChange={() => setType("ACCESS")}
            />
            {t("venuePage.dsar.access")}
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="dsar-type"
              checked={type === "ERASURE"}
              onChange={() => setType("ERASURE")}
            />
            {t("venuePage.dsar.erasure")}
          </label>
        </div>
        <input
          type="email"
          required
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] dark:border-white/10"
        />
        <input
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] dark:border-white/10"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Details (optional)"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] dark:border-white/10"
        />
        <PrivacyConsentCheckbox
          checked={privacyConsent}
          onChange={setPrivacyConsent}
          label={t("venuePage.privacyConsent.label")}
          disabled={busy}
        />
        {error ? (
          <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
        ) : null}
        {success ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{success}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-surface)] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("venuePage.dsar.submit")}
        </button>
      </form>
    </section>
  );
}
