"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { previewCheckout, type CheckoutPreview } from "@/lib/checkout-client";
import { ChargeGroups } from "./charge-groups";
import { CheckoutTotals } from "./checkout-totals";
import {
  classifyCheckoutError,
  type CheckoutIssueKind,
} from "./checkout-presenter";
import { SettlementStatus } from "./settlement-status";
import { TenderButtons, type CheckoutTender } from "./tender-buttons";

function errorDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message;
  return null;
}

export function CheckoutDrawer({
  checkId,
  expectedVersion,
  checkLabel,
  canWrite,
  locale = "en",
}: {
  checkId: string;
  expectedVersion: number;
  checkLabel?: string | null;
  canWrite: boolean;
  locale?: string;
}) {
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<CheckoutIssueKind | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [tenderBusy, setTenderBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
          checkId,
          useExpectedVersion ? expectedVersion : undefined,
        );
        setPreview(next);
        setIssue(null);
        return next;
      } catch (error) {
        const nextIssue = classifyCheckoutError(error);
        if (nextIssue === "conflict" && useExpectedVersion) {
          setIssue("conflict");
          try {
            const latest = await previewCheckout(checkId);
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
    [checkId, expectedVersion],
  );

  useEffect(() => {
    setPreview(null);
    setIssue(null);
    setNotice(null);
    void loadPreview(true);
  }, [loadPreview]);

  async function refreshLatest() {
    setNotice(null);
    return loadPreview(false);
  }

  async function onTender(tender: CheckoutTender) {
    if (!canWrite || tenderBusy) return;
    setTenderBusy(true);
    setNotice(null);
    try {
      const latest = await loadPreview(false);
      if (!latest) return;
      setNotice(
        `${tender} selected. The authoritative server total was refreshed. Chunk 03 does not charge, allocate, or post money.`,
      );
    } finally {
      setTenderBusy(false);
    }
  }

  const blockingIssue =
    issue === "offline" ||
    issue === "disabled" ||
    issue === "unauthorized" ||
    issue === "error";

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-zinc-950/75 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Checkout V2
            </span>
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold text-white">
            {checkLabel?.trim() || "Guest check"}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Server preview is the money authority. No finance-admin controls are exposed here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshLatest()}
          disabled={loading || tenderBusy}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh total
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)] lg:p-5">
        <div className="min-h-0 space-y-3">
          <SettlementStatus loading={loading && !preview} issue={issue} detail={detail} />
          {preview ? (
            <ChargeGroups
              lines={preview.lines}
              currency={preview.currency}
              locale={locale}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          {preview ? <CheckoutTotals preview={preview} locale={locale} /> : null}
          {preview && !blockingIssue ? (
            <TenderButtons
              canWrite={canWrite}
              busy={tenderBusy || loading}
              onSelect={(tender) => void onTender(tender)}
            />
          ) : null}
          {notice ? (
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-xs leading-5 text-sky-100" role="status">
              {notice}
            </div>
          ) : null}
          {preview ? (
            <p className="break-all text-[10px] leading-4 text-zinc-600">
              Source fingerprint: {preview.sourceHash}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
