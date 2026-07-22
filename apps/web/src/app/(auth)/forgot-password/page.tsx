"use client";

import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { ensureCsrf } from "@/lib/api";
import { requestOwnerPasswordReset } from "@/lib/auth-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";

export default function ForgotPasswordPage() {
  const { t } = usePublicPrefs();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDoneMessage(null);
    setLoading(true);
    try {
      await ensureCsrf();
      const res = await requestOwnerPasswordReset(email.trim().toLowerCase());
      setDoneMessage(res.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.forgot.requestFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={
        <>
          <Link
            href="/login"
            className="text-emerald-400 transition hover:text-emerald-300"
          >
            {t("auth.forgot.backToOwner")}
          </Link>
        </>
      }
    >
      {doneMessage ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
            {doneMessage}
          </p>
          <Link
            href="/login"
            className="inline-flex text-sm text-emerald-400 hover:underline"
          >
            {t("auth.forgot.returnToSignIn")}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label={t("auth.forgot.ownerEmail")}>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.forgot.emailPlaceholder")}
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading
              ? t("auth.forgot.sending")
              : t("auth.forgot.sendLink")}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
