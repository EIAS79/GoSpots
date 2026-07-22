"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { PublicCaptchaWidget } from "@/components/venues/public/public-captcha-widget";
import { PrivacyConsentCheckbox } from "@/components/venues/public/privacy-consent-checkbox";
import { cn } from "@/lib/cn";
import {
  isPublicCaptchaEnabled,
  withCaptchaToken,
} from "@/lib/public-captcha";
import { submitPublicVenueContact } from "@/lib/public-guest-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";

export function PublicContactForm({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const { t } = usePublicPrefs();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!guestName.trim()) {
      setError(t("venuePage.contact.nameRequired"));
      return;
    }
    if (!message.trim()) {
      setError(t("venuePage.contact.messageRequired"));
      return;
    }
    if (!guestEmail.trim() && !guestPhone.trim()) {
      setError(t("venuePage.contact.replyRequired"));
      return;
    }
    if (!privacyConsent) {
      setError(t("venuePage.privacyConsent.required"));
      return;
    }
    if (isPublicCaptchaEnabled() && !captchaToken?.trim()) {
      setError(t("venuePage.captcha.required"));
      return;
    }

    setBusy(true);
    try {
      const res = await submitPublicVenueContact(
        slug,
        withCaptchaToken(
          {
            guestName: guestName.trim(),
            guestEmail: guestEmail.trim() || undefined,
            guestPhone: guestPhone.trim() || undefined,
            subject: subject.trim() || undefined,
            message: message.trim(),
            privacyConsentAccepted: true,
          },
          captchaToken,
        ),
      );
      setSuccess(res.message);
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setSubject("");
      setMessage("");
      setPrivacyConsent(false);
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("venuePage.contact.sendFailed"),
      );
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div
        className={cn(
          "rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-center",
          className,
        )}
      >
        <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
        <p className="mt-3 text-sm font-medium text-emerald-100">{success}</p>
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-4 text-xs text-emerald-300 underline"
        >
          {t("venuePage.contact.sendAnother")}
        </button>
      </div>
    );
  }

  const fieldClass =
    "mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none placeholder:text-zinc-500 focus:border-amber-500/40 sm:text-sm";

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300" size={22} />
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-foreground)]">
            {t("venuePage.contact.title")}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {t("venuePage.contact.subtitle")}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.contact.yourName")}
          <input
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.contact.subject")}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("venuePage.contact.optional")}
            className={fieldClass}
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.contact.phone")}
          <input
            type="tel"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.contact.email")}
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          {t("venuePage.contact.message")}
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className={fieldClass}
          />
        </label>
      </div>

      <PublicCaptchaWidget
        className="mt-4"
        onTokenChange={setCaptchaToken}
        resetKey={captchaReset}
      />

      <div className="mt-3">
        <PrivacyConsentCheckbox
          checked={privacyConsent}
          onChange={setPrivacyConsent}
          label={t("venuePage.privacyConsent.label")}
          disabled={busy}
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {t("venuePage.contact.send")}
      </button>
    </form>
  );
}
