"use client";

import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  beginMfaTotp,
  confirmMfaTotp,
  disableMfaTotp,
  fetchMfaStatus,
  mfaErrorMessage,
  regenerateMfaRecoveryCodes,
  type MfaStatus,
} from "@/lib/auth-mfa-client";
import { revokeOtherAuthSessions } from "@/lib/auth-sessions-client";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

type Step =
  | { kind: "idle" }
  | { kind: "enroll"; password: string; secret: string; otpauthUri: string }
  | { kind: "codes"; codes: string[]; note: string }
  | { kind: "disable" }
  | { kind: "regen" };

export function AuthMfaPanel() {
  const vs = useVenueSettingsOptional();
  const t = vs?.t ?? ((key: string) => key);

  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchMfaStatus();
      setStatus(next);
    } catch (err) {
      setError(mfaErrorMessage(err) || t("settings.mfaLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setPassword("");
    setCode("");
    setRecoveryCode("");
  }

  async function onBeginEnroll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await beginMfaTotp(password);
      setStep({
        kind: "enroll",
        password,
        secret: res.secret,
        otpauthUri: res.otpauthUri,
      });
      setCode("");
    } catch (err) {
      setError(mfaErrorMessage(err) || t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "enroll") return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmMfaTotp(code.trim());
      try {
        await revokeOtherAuthSessions();
      } catch {
        // Non-fatal: MFA is on; sessions revoke is recommended only.
      }
      setStep({
        kind: "codes",
        codes: res.recoveryCodes,
        note: t("settings.mfaEnrollDone"),
      });
      resetForm();
      await load();
    } catch (err) {
      setError(mfaErrorMessage(err) || t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await disableMfaTotp({
        password,
        code: code.trim() || undefined,
        recoveryCode: recoveryCode.trim() || undefined,
      });
      try {
        await revokeOtherAuthSessions();
      } catch {
        /* ignore */
      }
      setStep({ kind: "idle" });
      resetForm();
      await load();
    } catch (err) {
      setError(mfaErrorMessage(err) || t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onRegenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await regenerateMfaRecoveryCodes({
        password,
        code: code.trim() || undefined,
        recoveryCode: recoveryCode.trim() || undefined,
      });
      setStep({
        kind: "codes",
        codes: res.recoveryCodes,
        note: t("settings.mfaRegenDone"),
      });
      resetForm();
      await load();
    } catch (err) {
      setError(mfaErrorMessage(err) || t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function copyCodes(codes: string[]) {
    void navigator.clipboard?.writeText(codes.join("\n"));
  }

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck size={18} />
            <h2 className="font-semibold text-white">{t("settings.mfa")}</h2>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{t("settings.mfaHint")}</p>
        </div>
        {status?.totpEnabled ? (
          <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
            {t("settings.mfaOn")}
          </span>
        ) : (
          <span className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1 text-xs text-zinc-400">
            {t("settings.mfaOff")}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("settings.mfaLoading")}</p>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {step.kind === "codes" ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-100/90">{step.note}</p>
          <p className="text-xs text-amber-200/90">{t("settings.mfaCodesOnce")}</p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-zinc-950/80 p-3 font-mono text-sm text-zinc-100">
            {step.codes.join("\n")}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyCodes(step.codes)}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              {t("settings.mfaCopyCodes")}
            </button>
            <button
              type="button"
              onClick={() => setStep({ kind: "idle" })}
              className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300"
            >
              {t("settings.mfaCodesSaved")}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && step.kind === "idle" && status && !status.totpEnabled ? (
        <form onSubmit={onBeginEnroll} className="space-y-3">
          <p className="text-sm text-zinc-400">{t("settings.mfaEnrollLead")}</p>
          <label className="block text-xs text-zinc-500">
            {t("settings.mfaPassword")}
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {t("settings.mfaStartEnroll")}
          </button>
        </form>
      ) : null}

      {step.kind === "enroll" ? (
        <form onSubmit={onConfirmEnroll} className="space-y-3">
          <p className="text-sm text-zinc-400">{t("settings.mfaScanLead")}</p>
          <p className="break-all rounded-lg border border-white/10 bg-zinc-950/70 p-3 font-mono text-xs text-zinc-300">
            {step.secret}
          </p>
          <p className="text-[11px] text-zinc-500">{t("settings.mfaManualSecret")}</p>
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer text-zinc-400">
              {t("settings.mfaShowUri")}
            </summary>
            <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
              {step.otpauthUri}
            </p>
          </details>
          <label className="block text-xs text-zinc-500">
            {t("settings.mfaCode")}
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || code.trim().length !== 6}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("settings.mfaConfirmEnroll")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep({ kind: "idle" });
                resetForm();
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {!loading && step.kind === "idle" && status?.totpEnabled ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            {t("settings.mfaCodesRemaining", {
              count: status.recoveryCodesRemaining,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setStep({ kind: "regen" });
              }}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              {t("settings.mfaRegen")}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setStep({ kind: "disable" });
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
            >
              <ShieldOff size={14} />
              {t("settings.mfaDisable")}
            </button>
          </div>
        </div>
      ) : null}

      {step.kind === "disable" || step.kind === "regen" ? (
        <form
          onSubmit={step.kind === "disable" ? onDisable : onRegenerate}
          className="mt-2 space-y-3"
        >
          <p className="text-sm text-zinc-400">
            {step.kind === "disable"
              ? t("settings.mfaDisableLead")
              : t("settings.mfaRegenLead")}
          </p>
          <label className="block text-xs text-zinc-500">
            {t("settings.mfaPassword")}
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            {t("settings.mfaCode")}
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            {t("settings.mfaRecoveryCode")}
            <input
              type="text"
              autoComplete="off"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="XXXX-XXXX"
              className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </label>
          <p className="text-[11px] text-zinc-500">{t("settings.mfaCodeOrRecovery")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !password || (!code.trim() && !recoveryCode.trim())}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {step.kind === "disable"
                ? t("settings.mfaDisableConfirm")
                : t("settings.mfaRegenConfirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep({ kind: "idle" });
                resetForm();
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
