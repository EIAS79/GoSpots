"use client";

import {
  CreditCard,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import {
  cancelDualSubscription,
  fetchBillingProviders,
  fetchBillingStatus,
  isDualBillingStatus,
  openBillingPortal,
  openStripeCustomerPortal,
  pauseDualSubscription,
  resumeDualSubscription,
  startBillingCheckout,
  startDualBillingCheckout,
  startManualRenewalCheckout,
  storePendingBillingOperation,
  switchDualProvider,
  updateDualPaymentMethod,
  type BillingProvider,
  type BillingRenewalMode,
  type BillingStatusResponse,
  type DualBillingSubscription,
} from "@/lib/dashboard-client";
import { useVenueSettings } from "@/lib/venue-settings-context";

const LIVE_STATUSES = new Set([
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "UNPAID",
  "PAUSED",
  "PAUSE_PENDING",
  "RESUME_PENDING",
  "CANCEL_AT_PERIOD_END",
  "REQUIRES_ACTION",
  "PROCESSING",
  "INCOMPLETE",
]);

function isLiveDualSub(sub: DualBillingSubscription | null | undefined) {
  return !!sub && LIVE_STATUSES.has(sub.canonicalStatus);
}

function LemonBillingFallback({
  monthlyTotal,
  configured,
  missingEnv,
  hasLemonSub,
  trialActive,
  trialExpired,
}: {
  monthlyTotal: number;
  configured: boolean;
  missingEnv?: string[];
  hasLemonSub: boolean;
  trialActive: boolean;
  trialExpired: boolean;
}) {
  const { formatFromEur, t } = useVenueSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const { url } = hasLemonSub
        ? await openBillingPortal()
        : await startBillingCheckout();
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("subscription.billingFailed"),
      );
      setLoading(false);
    }
  }

  const missing = (missingEnv ?? []).filter(Boolean);

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <CreditCard size={18} className="text-emerald-400" />
            {t("subscription.billingTitle")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            {t("subscription.billingBody", {
              price: formatFromEur(monthlyTotal),
            })}
          </p>
          {hasLemonSub ? (
            <p className="mt-2 text-xs text-zinc-500">
              {t("subscription.billingManageHint")}
            </p>
          ) : null}
          {!configured ? (
            <p className="mt-2 text-xs text-amber-200/90">
              {missing.length > 0
                ? t("subscription.billingMissingKeys", {
                    keys: missing.join(", "),
                  })
                : t("subscription.billingNotConfigured")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!configured || loading}
          onClick={() => void go()}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40",
            trialExpired || !hasLemonSub
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
          )}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ExternalLink size={16} />
          )}
          {hasLemonSub
            ? t("subscription.manageBilling")
            : trialActive
              ? t("subscription.addPayment")
              : t("subscription.activate")}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}

type ConfirmKind = "cancel" | "pause" | "switch" | null;

export function BillingCheckoutCard({
  monthlyTotal,
  configured,
  missingEnv,
  hasLemonSub,
  trialActive,
  trialExpired,
  packId,
  addOnIds,
  seatQuantity,
  currency,
  dualSubscription,
  onDualUpdated,
}: {
  monthlyTotal: number;
  configured: boolean;
  missingEnv?: string[];
  hasLemonSub: boolean;
  trialActive: boolean;
  trialExpired: boolean;
  packId: string;
  addOnIds: string[];
  seatQuantity: number;
  currency: string;
  dualSubscription: DualBillingSubscription | null;
  onDualUpdated?: () => void;
}) {
  const { formatFromEur, t } = useVenueSettings();
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [providers, setProviders] = useState<BillingProvider[]>([]);
  const [defaultProvider, setDefaultProvider] =
    useState<BillingProvider>("STRIPE");
  const [provider, setProvider] = useState<BillingProvider>("STRIPE");
  const [renewalMode, setRenewalMode] =
    useState<BillingRenewalMode>("AUTOMATIC_RENEWAL");
  const [autoRenewConsent, setAutoRenewConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [switchTarget, setSwitchTarget] = useState<BillingProvider | null>(
    null,
  );

  const dual = isDualBillingStatus(status);
  const live = isLiveDualSub(dualSubscription);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await fetchBillingStatus();
        if (cancelled) return;
        setStatus(st);
        if (isDualBillingStatus(st)) {
          try {
            const list = await fetchBillingProviders();
            if (cancelled) return;
            const enabled = list.providers.filter(
              (p): p is BillingProvider => p === "STRIPE" || p === "MOLLIE",
            );
            setProviders(enabled.length ? enabled : ["STRIPE", "MOLLIE"]);
            setDefaultProvider(list.defaultProvider);
            setProvider(list.defaultProvider);
          } catch {
            const fromStatus = (st.providers ?? []).filter(
              (p): p is BillingProvider => p === "STRIPE" || p === "MOLLIE",
            );
            setProviders(fromStatus.length ? fromStatus : ["STRIPE", "MOLLIE"]);
            if (st.defaultProvider) {
              setDefaultProvider(st.defaultProvider);
              setProvider(st.defaultProvider);
            }
          }
        }
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const otherProvider = useMemo(() => {
    if (!dualSubscription) return null;
    const cur = dualSubscription.provider;
    return providers.find((p) => p !== cur) ?? null;
  }, [dualSubscription, providers]);

  async function redirectHosted(url: string, operationId?: string) {
    if (operationId) storePendingBillingOperation(operationId);
    window.location.href = url;
  }

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      if (
        renewalMode === "AUTOMATIC_RENEWAL" &&
        autoRenewConsent !== true
      ) {
        setError(t("subscription.billingAutoRenewRequired"));
        setLoading(false);
        return;
      }
      const result = await startDualBillingCheckout({
        provider,
        renewalMode,
        packId,
        addOnIds,
        seatQuantity,
        currency,
        autoRenewConsent:
          renewalMode === "AUTOMATIC_RENEWAL" ? true : undefined,
      });
      await redirectHosted(result.url, result.operationId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("subscription.billingFailed"),
      );
      setLoading(false);
    }
  }

  async function runManage(
    action: () => Promise<{ url?: string; operationId?: string } | unknown>,
  ) {
    setLoading(true);
    setError(null);
    try {
      const result = (await action()) as {
        url?: string;
        operationId?: string;
      };
      if (result?.url) {
        await redirectHosted(result.url, result.operationId);
        return;
      }
      onDualUpdated?.();
      setLoading(false);
      setConfirmKind(null);
      setSwitchTarget(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("subscription.billingFailed"),
      );
      setLoading(false);
      setConfirmKind(null);
    }
  }

  if (bootLoading) {
    return (
      <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
      </section>
    );
  }

  if (!dual) {
    return (
      <LemonBillingFallback
        monthlyTotal={monthlyTotal}
        configured={configured}
        missingEnv={missingEnv}
        hasLemonSub={hasLemonSub}
        trialActive={trialActive}
        trialExpired={trialExpired}
      />
    );
  }

  const dualConfigured =
    providers.length > 0 && (status?.enabled !== false);

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <CreditCard size={18} className="text-emerald-400" />
          {t("subscription.billingTitle")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          {t("subscription.billingDualBody", {
            price: formatFromEur(monthlyTotal),
          })}
        </p>
        <p className="mt-2 text-xs text-amber-200/90">
          {t("subscription.billingProvidersNotPortable")}
        </p>
      </div>

      {live && dualSubscription ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-300">
            {t("subscription.billingManageDualHint", {
              provider: dualSubscription.provider,
              mode:
                dualSubscription.renewalMode === "MANUAL_MONTHLY"
                  ? t("subscription.renewalManual")
                  : t("subscription.renewalAutomatic"),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void runManage(() => updateDualPaymentMethod())
              }
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CreditCard size={14} />
              )}
              {t("subscription.updatePaymentMethod")}
            </button>
            {dualSubscription.provider === "STRIPE" ? (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void runManage(() => openStripeCustomerPortal())
                }
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
              >
                <ExternalLink size={14} />
                {t("subscription.openStripePortal")}
              </button>
            ) : null}
            {dualSubscription.renewalMode === "MANUAL_MONTHLY" ? (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void runManage(() => startManualRenewalCheckout())
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <RefreshCw size={14} />
                {t("subscription.payNow")}
              </button>
            ) : null}
            {dualSubscription.canonicalStatus === "PAUSED" ||
            dualSubscription.canonicalStatus === "PAUSE_PENDING" ? (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void runManage(() => resumeDualSubscription())
                }
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
              >
                <Play size={14} />
                {t("subscription.resumeSubscription")}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => setConfirmKind("pause")}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
              >
                <Pause size={14} />
                {t("subscription.pauseSubscription")}
              </button>
            )}
            {otherProvider ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setSwitchTarget(otherProvider);
                  setConfirmKind("switch");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/10 disabled:opacity-40"
              >
                <RefreshCw size={14} />
                {t("subscription.switchProvider", {
                  provider: otherProvider,
                })}
              </button>
            ) : null}
            <button
              type="button"
              disabled={loading}
              onClick={() => setConfirmKind("cancel")}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
            >
              {t("subscription.cancelSubscription")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("subscription.billingProviderLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {providers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    provider === p
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                      : "border-white/10 text-zinc-300 hover:bg-white/5",
                  )}
                >
                  {p === "STRIPE"
                    ? t("subscription.providerStripe")
                    : t("subscription.providerMollie")}
                  {p === defaultProvider ? (
                    <span className="ml-1 text-[10px] text-zinc-500">
                      ({t("subscription.providerDefault")})
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("subscription.renewalModeLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  "AUTOMATIC_RENEWAL",
                  "MANUAL_MONTHLY",
                ] as BillingRenewalMode[]
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setRenewalMode(mode);
                    if (mode === "MANUAL_MONTHLY") setAutoRenewConsent(false);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    renewalMode === mode
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                      : "border-white/10 text-zinc-300 hover:bg-white/5",
                  )}
                >
                  {mode === "AUTOMATIC_RENEWAL"
                    ? t("subscription.renewalAutomatic")
                    : t("subscription.renewalManual")}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {renewalMode === "AUTOMATIC_RENEWAL"
                ? t("subscription.renewalAutomaticHint")
                : t("subscription.renewalManualHint")}
            </p>
          </div>

          {renewalMode === "AUTOMATIC_RENEWAL" ? (
            <label className="flex items-start gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="mt-1 rounded border-white/20 bg-zinc-900"
                checked={autoRenewConsent}
                onChange={(e) => setAutoRenewConsent(e.target.checked)}
              />
              <span>{t("subscription.autoRenewConsent")}</span>
            </label>
          ) : null}

          <button
            type="button"
            disabled={!dualConfigured || loading || !packId}
            onClick={() => void startCheckout()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40",
              trialExpired
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-emerald-600 hover:bg-emerald-500",
            )}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ExternalLink size={16} />
            )}
            {trialActive
              ? t("subscription.addPayment")
              : t("subscription.activate")}
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : null}

      <ConfirmDialog
        open={confirmKind === "cancel"}
        title={t("subscription.cancelConfirmTitle")}
        description={t("subscription.cancelConfirmDesc")}
        confirmLabel={t("subscription.cancelConfirmAction")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={loading}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() =>
          void runManage(() => cancelDualSubscription("PERIOD_END"))
        }
      />
      <ConfirmDialog
        open={confirmKind === "pause"}
        title={t("subscription.pauseConfirmTitle")}
        description={t("subscription.pauseConfirmDesc")}
        confirmLabel={t("subscription.pauseConfirmAction")}
        cancelLabel={t("common.cancel")}
        busy={loading}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => void runManage(() => pauseDualSubscription())}
      />
      <ConfirmDialog
        open={confirmKind === "switch" && !!switchTarget}
        title={t("subscription.switchConfirmTitle", {
          provider: switchTarget ?? "",
        })}
        description={t("subscription.switchConfirmDesc")}
        confirmLabel={t("subscription.switchConfirmAction")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={loading}
        onCancel={() => {
          setConfirmKind(null);
          setSwitchTarget(null);
        }}
        onConfirm={() => {
          if (!switchTarget) return;
          void runManage(() =>
            switchDualProvider({
              provider: switchTarget,
              renewalMode:
                dualSubscription?.renewalMode === "MANUAL_MONTHLY"
                  ? "MANUAL_MONTHLY"
                  : "AUTOMATIC_RENEWAL",
              autoRenewConsent:
                dualSubscription?.renewalMode !== "MANUAL_MONTHLY"
                  ? true
                  : undefined,
            }),
          );
        }}
      />
    </section>
  );
}
