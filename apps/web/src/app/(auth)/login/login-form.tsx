"use client";

import {
  Briefcase,
  Building2,
  Loader2,
  Lock,
  Mail,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { cn } from "@/lib/cn";
import {
  login,
  requestStaffPasswordReset,
  type UserAccountType,
} from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";
import { dashboardBase } from "@/lib/venue-dashboard";

type LoginPanel = "owner" | "staff";
type StaffMode = "login" | "forgot";

export function LoginForm() {
  const router = useRouter();
  const { reload } = useAuth();
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(
        loginId.trim().toLowerCase(),
        password,
        accountType,
      );
      await reload();
      const home = session.dashboardPath
        ? dashboardBase(session.dashboardPath)
        : "/dashboard";
      const dest =
        nextParam &&
        session.dashboardPath &&
        nextParam.startsWith(`/dashboard/${session.dashboardPath}`)
          ? nextParam
          : home;
      router.replace(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
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
      const res = await requestStaffPasswordReset(
        venueName.trim(),
        loginId.trim().toLowerCase(),
      );
      setForgotDone(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const staffForgot = !isOwner && staffMode === "forgot";

  return (
    <AuthCard
      title={staffForgot ? "Forgot staff password" : "Sign in"}
      subtitle={
        staffForgot
          ? "Enter your venue (or owner) name and staff login ID. Your owner will get a notification and send you a new setup link."
          : isOwner
            ? "Venue owner — use the email you registered with."
            : "Staff — use the login ID your manager gave you."
      }
      footer={
        staffForgot ? (
          <button
            type="button"
            onClick={backToStaffLogin}
            className="text-cyan-400 transition hover:text-cyan-300"
          >
            Back to staff sign in
          </button>
        ) : isOwner ? (
          <>
            New here?{" "}
            <Link
              href="/register"
              className="text-emerald-400 transition hover:text-emerald-300"
            >
              Create your venue account
            </Link>
          </>
        ) : (
          <>
            Need a login? Ask your venue owner or manager — staff accounts are
            created by them.
          </>
        )
      }
    >
      {!staffForgot ? (
        <div
          role="tablist"
          aria-label="Account type"
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
            Owner
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
            Staff
          </button>
        </div>
      ) : null}

      {isOwner ? (
        <form
          key="owner-panel"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <p className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-emerald-100/80">
            Owners manage the venue, subscription, and team. You can reset your
            password if you forget it.
          </p>

          <Field label="Email">
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
                placeholder="you@venue.com"
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>

          <Field label="Password">
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
              Forgot your password?
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
            {loading ? "Signing in…" : "Sign in as owner"}
          </button>
        </form>
      ) : staffForgot ? (
        forgotDone ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
              {forgotDone}
            </p>
            <p className="text-xs leading-relaxed text-zinc-500">
              Your owner opens <span className="text-zinc-300">Employee accounts</span>,
              generates a new link, and sends it to you (WhatsApp, SMS, etc.).
              Open that link to choose a new password — same as a new account.
            </p>
            <button
              type="button"
              onClick={backToStaffLogin}
              className="inline-flex text-sm text-cyan-400 hover:underline"
            >
              Back to staff sign in
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
              We notify your venue owner. They create a fresh setup link and
              send it to you — we never email staff passwords.
            </p>

            <Field label="Venue or owner name">
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
                  placeholder="e.g. Zuzu Arcade"
                  className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
            </Field>

            <Field label="Staff login ID">
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
                  placeholder="anna@your-venue.gospots"
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
              {loading ? "Sending…" : "Notify owner"}
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
            Use your staff login ID and the password you set from the setup
            link. Forgot it? Ask your owner for a new link below.
          </p>

          <Field label="Staff login ID">
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
                placeholder="anna@your-venue.gospots"
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 font-mono text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-cyan-400/20"
              />
            </div>
          </Field>

          <Field label="Password">
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
              Forgot password?
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
            {loading ? "Signing in…" : "Sign in as staff"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
