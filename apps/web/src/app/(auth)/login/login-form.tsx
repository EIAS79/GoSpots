"use client";

import {
  Briefcase,
  Building2,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { cn } from "@/lib/cn";
import { ensureCsrf, resolveApiErrorDisplay } from "@/lib/api";
import { sessionRevokedUserMessage } from "@/lib/api-error-message";
import {
  login,
  requestStaffPasswordReset,
  type UserAccountType,
} from "@/lib/auth-client";
import { isMfaLoginChallenge, verifyMfaLogin } from "@/lib/auth-mfa-client";
import { consumeSessionRevokedNotice } from "@/lib/auth-session";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useAuth } from "@/lib/use-auth";
import {
  dashboardBase,
  toPublicDashboardPathname,
  toPublicVenuePath,
} from "@/lib/venue-dashboard";

type LoginPanel = "owner" | "staff";
type StaffMode = "login" | "forgot";

export function LoginForm() {
  const router = useRouter();
  const { reload } = useAuth();
  const { t } = usePublicPrefs();
  const params = useSearchParams();
  const nextParam = params.get("next");
  const initialPanel: LoginPanel =
    params.get("as") === "staff" || params.get("as") === "employee"
      ? "staff"
      : "owner";

  const [panel, setPanel] = useState<LoginPanel>(initialPanel);
  const [staffMode, setStaffMode] = useState<StaffMode>("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotDone, setForgotDone] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecovery, setMfaRecovery] = useState("");

  useEffect(() => {
    if (consumeSessionRevokedNotice()) {
      setError(sessionRevokedUserMessage());
    }
  }, []);

  const isOwner = panel === "owner";
  const accountType: UserAccountType = isOwner
    ? "VENUE_OWNER"
    : "VENUE_STAFF";

  function switchPanel(next: LoginPanel) {
    setPanel(next);
    setStaffMode("login");
    setError(null);
    setForgotDone(null);
    setLoginId("");
    setPassword("");
    setVenueName("");
    setMfaToken(null);
    setMfaCode("");
    setMfaRecovery("");
  }

  function openStaffForgot() {
    setStaffMode("forgot");
    setError(null);
    setForgotDone(null);
    setPassword("");
  }

  function backToStaffLogin() {
    setStaffMode("login");
    setError(null);
    setForgotDone(null);
    setVenueName("");
  }

  function backFromMfa() {
    setMfaToken(null);
    setMfaCode("");
    setMfaRecovery("");
    setError(null);
  }

  async function finishSession(session: { venuePath: string | null }) {
    await reload();
    const home = session.venuePath
      ? dashboardBase(session.venuePath)
      : "/dashboard";
    const publicPath = session.venuePath
      ? toPublicVenuePath(session.venuePath)
      : null;
    const nextClean = nextParam ? toPublicDashboardPathname(nextParam) : null;
    const dest =
      nextClean &&
      publicPath &&
      (nextClean === `/dashboard/${publicPath}` ||
        nextClean.startsWith(`/dashboard/${publicPath}/`))
        ? nextClean
        : home;
    router.replace(dest);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await ensureCsrf();
      const session = await login(
        loginId.trim().toLowerCase(),
        password,
        accountType,
      );
      if (isMfaLoginChallenge(session)) {
        setMfaToken(session.mfaToken);
        setMfaCode("");
        setMfaRecovery("");
        return;
      }
      await finishSession(session);
    } catch (err) {
      setError(
        resolveApiErrorDisplay(
          err,
          { CSRF_INVALID: t("auth.login.csrfInvalid") },
          t("auth.login.failed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setLoading(true);
    try {
      await ensureCsrf();
      const session = await verifyMfaLogin({
        mfaToken,
        code: mfaCode.trim() || undefined,
        recoveryCode: mfaRecovery.trim() || undefined,
      });
      await finishSession(session);
    } catch (err) {
      setError(
        resolveApiErrorDisplay(
          err,
          {
            CSRF_INVALID: t("auth.login.csrfInvalid"),
            MFA_INVALID: t("auth.login.mfaFailed"),
          },
          t("auth.login.mfaFailed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onStaffForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setForgotDone(null);
    setLoading(true);
    try {
      await ensureCsrf();
      const res = await requestStaffPasswordReset(
        venueName.trim(),
        loginId.trim().toLowerCase(),
      );
      setForgotDone(res.message);
    } catch (err) {
      setError(
        resolveApiErrorDisplay(
          err,
          { CSRF_INVALID: t("auth.login.csrfInvalid") },
          t("auth.login.requestFailed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  const staffForgot = !isOwner && staffMode === "forgot";
  const mfaStep = Boolean(mfaToken);

  return (
    <AuthCard
      title={
        mfaStep
          ? t("auth.login.mfaTitle")
          : staffForgot
            ? t("auth.login.staffForgotTitle")
            : t("auth.login.title")
      }
      subtitle={
        mfaStep
          ? t("auth.login.mfaSubtitle")
          : staffForgot
            ? t("auth.login.subtitleStaffForgot")
            : isOwner
              ? t("auth.login.subtitleOwner")
              : t("auth.login.subtitleStaff")
      }
      footer={
        mfaStep ? (
          <button
            type="button"
            onClick={backFromMfa}
            className="text-emerald-400 transition hover:text-emerald-300"
          >
            {t("auth.login.mfaBack")}
          </button>
        ) : staffForgot ? (
          <button
            type="button"
            onClick={backToStaffLogin}
            className="text-cyan-400 transition hover:text-cyan-300"
          >
            {t("auth.login.backToStaff")}
          </button>
        ) : isOwner ? (
          <>
            {t("auth.login.newHere")}{" "}
            <Link
              href="/register"
              className="text-emerald-400 transition hover:text-emerald-300"
            >
              {t("auth.login.createAccount")}
            </Link>
          </>
        ) : (
          <>{t("auth.login.staffNeedLogin")}</>
        )
      }
    >
      {mfaStep ? (
        <form
          key="mfa-challenge"
          onSubmit={onMfaVerify}
          className="flex flex-col gap-4"
          noValidate
        >
          <p className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-emerald-100/80">
            <ShieldCheck size={14} className="mr-1 inline align-text-bottom" />
            {t("auth.login.mfaSubtitle")}
          </p>
          <Field label={t("auth.login.mfaCode")}>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            />
          </Field>
          <p className="text-[11px] text-zinc-500">
            {t("auth.login.mfaOrRecovery")}
          </p>
          <Field label={t("auth.login.mfaRecovery")}>
            <input
              type="text"
              autoComplete="off"
              value={mfaRecovery}
              onChange={(e) => setMfaRecovery(e.target.value)}
              placeholder="XXXX-XXXX"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            />
          </Field>
          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || (!mfaCode.trim() && !mfaRecovery.trim())}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? t("auth.login.signingIn") : t("auth.login.mfaVerify")}
          </button>
        </form>
      ) : !staffForgot ? (
        <div
          role="tablist"
          aria-label={t("auth.login.accountType")}
          className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-zinc-950/90 p-1 ring-1 ring-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isOwner}
            onClick={() => switchPanel("owner")}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              isOwner
                ? "bg-emerald-500/20 text-emerald-100 shadow-sm ring-1 ring-emerald-400/30"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
            )}
          >
            <Briefcase size={15} />
            {t("auth.login.owner")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isOwner}
            onClick={() => switchPanel("staff")}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              !isOwner
                ? "bg-cyan-500/20 text-cyan-100 shadow-sm ring-1 ring-cyan-400/30"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
            )}
          >
            <UserRound size={15} />
            {t("auth.login.staff")}
          </button>
        </div>
      ) : null}

      {mfaStep ? null : isOwner ? (
        <form
          key="owner-panel"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <p className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-emerald-100/80">
            {t("auth.login.ownerTip")}
          </p>

          <Field label={t("auth.login.email")}>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="email"
                autoComplete="email"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder={t("auth.login.emailPlaceholder")}
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>

          <Field label={t("auth.login.password")}>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                maxLength={128}
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-emerald-400/90 transition hover:text-emerald-300"
            >
              {t("auth.login.forgotOwnerPassword")}
            </Link>
          </div>

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
              ? t("auth.login.signingIn")
              : t("auth.login.signInOwner")}
          </button>
        </form>
      ) : staffForgot ? (
        forgotDone ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
              {forgotDone}
            </p>
            <p className="text-xs leading-relaxed text-zinc-500">
              {t("auth.login.staffForgotDoneLead")}{" "}
              <span className="text-zinc-300">
                {t("auth.login.employeeAccounts")}
              </span>
              {t("auth.login.staffForgotDoneTrail")}
            </p>
            <button
              type="button"
              onClick={backToStaffLogin}
              className="inline-flex text-sm text-cyan-400 hover:underline"
            >
              {t("auth.login.backToStaff")}
            </button>
          </div>
        ) : (
          <form
            key="staff-forgot"
            onSubmit={onStaffForgot}
            className="flex flex-col gap-4"
            noValidate
          >
            <p className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-[11px] leading-relaxed text-cyan-100/80">
              {t("auth.login.staffForgotTip")}
            </p>

            <Field label={t("auth.login.venueOrOwnerName")}>
              <div className="relative">
                <Building2
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder={t("auth.login.venuePlaceholder")}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
            </Field>

            <Field label={t("auth.login.staffLoginId")}>
              <div className="relative">
                <UserRound
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder={t("auth.login.staffIdPlaceholder")}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 font-mono text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-cyan-400/20"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading
                ? t("auth.login.sending")
                : t("auth.login.notifyOwner")}
            </button>
          </form>
        )
      ) : (
        <form
          key="staff-panel"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <p className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-[11px] leading-relaxed text-cyan-100/80">
            {t("auth.login.staffTip")}
          </p>

          <Field label={t("auth.login.staffLoginId")}>
            <div className="relative">
              <UserRound
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                autoComplete="username"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder={t("auth.login.staffIdPlaceholder")}
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 font-mono text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-cyan-400/20"
              />
            </div>
          </Field>

          <Field label={t("auth.login.password")}>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                maxLength={128}
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-cyan-400/20"
              />
            </div>
          </Field>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={openStaffForgot}
              className="text-xs text-cyan-400/90 transition hover:text-cyan-300"
            >
              {t("auth.login.forgotStaffPassword")}
            </button>
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading
              ? t("auth.login.signingIn")
              : t("auth.login.signInStaff")}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
