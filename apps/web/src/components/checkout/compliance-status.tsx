"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  fetchComplianceDocument,
  fetchFiscalDevices,
  fetchSettlementComplianceStatus,
  fiscalizeReceipt,
  generateSettlementComplianceDocument,
  reconcileComplianceRequest,
  reconcileFiscalRequest,
  submitComplianceDocumentToKsef,
  type FiscalDevice,
  type SettlementComplianceStatus,
} from "@/lib/compliance-client";

export function CheckoutComplianceStatus({
  settlementId,
  canWrite,
}: {
  settlementId: string;
  canWrite: boolean;
}) {
  const [status, setStatus] = useState<SettlementComplianceStatus | null>(null);
  const [devices, setDevices] = useState<FiscalDevice[]>([]);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");

  const reload = useCallback(async () => {
    try {
      const next = await fetchSettlementComplianceStatus(settlementId);
      setStatus(next);
      setSupported(true);
      try {
        setDevices((await fetchFiscalDevices()).filter((device) => device.enabled));
      } catch {
        setDevices([]);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setSupported(false);
        setStatus(null);
        return;
      }
      setError(cause instanceof Error ? cause.message : "Could not load fiscal status.");
    }
  }, [settlementId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!supported || !status?.paid) return null;

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Compliance action failed.");
    } finally {
      setBusy(null);
    }
  };

  const issueReceipt = () =>
    run("receipt", async () => {
      const doc = await generateSettlementComplianceDocument(settlementId, { kind: "RECEIPT" });
      const device = devices[0];
      if (device) await fiscalizeReceipt(doc.id, device.id);
    });

  const issueInvoice = () =>
    run("invoice", async () => {
      const doc = await generateSettlementComplianceDocument(settlementId, {
        kind: "INVOICE",
        buyerName: buyerName.trim(),
        buyerTaxId: buyerTaxId.trim(),
      });
      await submitComplianceDocumentToKsef(doc.id);
      setInvoiceForm(false);
    });

  const reconcile = () =>
    run("reconcile", async () => {
      if (!status.document) return;
      const full = await fetchComplianceDocument(status.document.id);
      const request = full.requests?.at(-1) ?? status.document.lastRequest;
      if (!request) return;
      if (status.document.kind === "RECEIPT") await reconcileFiscalRequest(request.id);
      else await reconcileComplianceRequest(request.id);
    });

  const stateCopy = {
    PAID: { label: "Paid · fiscal document pending", icon: ReceiptText, className: "text-amber-300" },
    FISCALIZING: { label: "Fiscalizing", icon: Loader2, className: "text-cyan-300" },
    ISSUED: { label: "Fiscal document issued", icon: CheckCircle2, className: "text-emerald-300" },
    ACTION_REQUIRED: { label: "Fiscal action required", icon: AlertTriangle, className: "text-amber-300" },
    UNPAID: { label: "Unpaid", icon: FileText, className: "text-muted-foreground" },
  }[status.state];
  const Icon = stateCopy.icon;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-4" data-testid="checkout-compliance-status">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Poland fiscal</p>
          <div className={`mt-1 flex items-center gap-2 text-sm font-semibold ${stateCopy.className}`}>
            <Icon className={`h-4 w-4 ${status.state === "FISCALIZING" ? "animate-spin" : ""}`} />
            {stateCopy.label}
          </div>
        </div>
        {status.document?.documentNumber ? (
          <span className="text-xs text-muted-foreground">{status.document.documentNumber}</span>
        ) : null}
      </div>

      {status.state === "PAID" && canWrite ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={Boolean(busy)} onClick={() => void issueReceipt()} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            {busy === "receipt" ? "Fiscalizing…" : "Fiscal receipt"}
          </button>
          <button type="button" disabled={Boolean(busy)} onClick={() => setInvoiceForm((value) => !value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            Invoice
          </button>
        </div>
      ) : null}

      {invoiceForm && canWrite ? (
        <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
          <input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Buyer company name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={buyerTaxId} onChange={(event) => setBuyerTaxId(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Buyer NIP (10 digits)" inputMode="numeric" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <button type="button" disabled={Boolean(busy) || !buyerName.trim() || buyerTaxId.length !== 10} onClick={() => void issueInvoice()} className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-black disabled:opacity-40">
            {busy === "invoice" ? "Submitting…" : "Create invoice & send to KSeF"}
          </button>
        </div>
      ) : null}

      {(status.state === "FISCALIZING" || status.state === "ACTION_REQUIRED") && canWrite ? (
        <button type="button" disabled={Boolean(busy)} onClick={() => void reconcile()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${busy === "reconcile" ? "animate-spin" : ""}`} />
          Reconcile provider status
        </button>
      ) : null}

      {status.document?.ksefNumber ? <p className="text-xs text-muted-foreground">KSeF: {status.document.ksefNumber}</p> : null}
      {!devices.length && status.state === "PAID" ? <p className="text-xs text-muted-foreground">No fiscal receipt device configured. Invoice/KSeF can still be used when enabled.</p> : null}
      {error ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{error}</p> : null}
    </section>
  );
}
