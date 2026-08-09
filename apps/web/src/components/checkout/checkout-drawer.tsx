"use client";

import { RefreshCw, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { previewCheckout, type CheckoutPreview } from "@/lib/checkout-client";
import type { GuestCheck } from "@/lib/guest-check-client";
import { ChargeGroups } from "./charge-groups";
import { CheckoutSourcePicker } from "./checkout-source-picker";
import { CheckoutTotals } from "./checkout-totals";
import {
  classifyCheckoutError,
  type CheckoutIssueKind,
} from "./checkout-presenter";
import { SettlementStatus } from "./settlement-status";
import { TenderButtons } from "./tender-buttons";

function errorDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message;
  return null;
}

export function CheckoutDrawer({
  check,
  canWrite,
  locale = "en",
  onCheckChanged,
}: {
  check: GuestCheck;
  canWrite: boolean;
  locale?: string;
  onCheckChanged: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<CheckoutIssueKind | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const loadPreview = useCallback(
    async (useExpectedVersion: boolean): Promise<CheckoutPreview | null> => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setIssue("offline");
        setDetail(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      setDetail(null);
      try {
        const next = await previewCheckout(
          check.id,
          useExpectedVersion ? check.version : undefined,
        );
        setPreview(next);
        setIssue(null);
        return next;
      } catch (error) {
        const nextIssue = classifyCheckoutError(error);
        if (nextIssue === "conflict" && useExpectedVersion) {
          setIssue("conflict");
          try {
            const latest = await previewCheckout(check.id);
            setPreview(latest);
            return latest;
          } catch (reloadError) {
            setPreview(null);
            setIssue(classifyCheckoutError(reloadError));
            setDetail(errorDetail(reloadError));
            return null;
          }
        }

        setPreview(null);
        setIssue(nextIssue);
        setDetail(errorDetail(error));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [check.id, check.version],
  );

  useEffect(() => {
    setPreview(null);
    setIssue(null);
    void loadPreview(true);
  }, [loadPreview]);

  async function handleSourceChanged() {
    await onCheckChanged();
    await loadPreview(false);
  }

  const blockingIssue =
    issue === "offline" ||
    issue === "disabled" ||
    issue === "unauthorized" ||
    issue === "error";

  const displayName =
    check.label?.trim() || check.guestName?.trim() || "Guest check";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-white sm:text-lg">
              {displayName}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {check.guestName?.trim()
                ? `${check.guestName} · ${check.partySize} guest${check.partySize === 1 ? "" : "s"}`
                : `Check #${check.id.slice(0, 8)} · ${check.partySize} guest${check.partySize === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadPreview(false)}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
          <CheckoutSourcePicker
            check={check}
            canWrite={canWrite}
            locale={locale}
            onChanged={handleSourceChanged}
          />

          <SettlementStatus
            loading={loading && !preview}
            issue={issue}
            detail={detail}
          />

          {preview ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Current bill</h3>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    Items and attached activity included in this check.
                  </p>
                </div>
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                  {preview.lines.length} line{preview.lines.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChargeGroups
                lines={preview.lines}
                currency={preview.currency}
                locale={locale}
              />
            </section>
          ) : null}
        </div>

        <aside className="border-t border-white/8 bg-black/15 p-4 xl:border-l xl:border-t-0 xl:p-5">
          <div className="space-y-4 xl:sticky xl:top-4">
            {preview ? <CheckoutTotals preview={preview} locale={locale} /> : null}
            {preview && !blockingIssue ? (
              <TenderButtons
                canWrite={canWrite}
                busy={loading}
                paymentsEnabled={false}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
