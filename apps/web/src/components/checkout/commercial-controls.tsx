"use client";

import { Loader2, Percent, ReceiptText, RefreshCw } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  addCommercialServiceCharge,
  addCommercialTip,
  applyCommercialAdjustment,
  fetchCommercialCheck,
  transferCommercialCheck,
  updateCommercialCheckProfile,
  type CommercialAdjustmentType,
  type CommercialCheckContext,
  type CommercialCheckType,
} from "@/lib/commercial-client";
import type { GuestCheck } from "@/lib/guest-check-client";

function toMinor(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

const CHECK_TYPES: Array<{ value: CommercialCheckType; label: string }> = [
  { value: "SESSION", label: "Session check" },
  { value: "RESTAURANT_TABLE", label: "Restaurant table" },
  { value: "BAR_TAB", label: "Bar tab" },
  { value: "COUNTER_SALE", label: "Counter sale" },
  { value: "TAKEAWAY", label: "Take-away" },
  { value: "RESERVATION_EVENT", label: "Reservation / event" },
  { value: "RETAIL", label: "Retail" },
];

type AdjustmentChoice = {
  value: CommercialAdjustmentType;
  label: string;
  needsPercent?: boolean;
  needsLine?: boolean;
};

export function CommercialControls({
  check,
  canWrite,
  canDiscount,
  canComp,
  canPriceOverride,
  onChanged,
}: {
  check: GuestCheck;
  canWrite: boolean;
  canDiscount: boolean;
  canComp: boolean;
  canPriceOverride: boolean;
  onChanged: () => Promise<void>;
}) {
  const [context, setContext] = useState<CommercialCheckContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkType, setCheckType] = useState<CommercialCheckType>("COUNTER_SALE");
  const [tableReference, setTableReference] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [adjustmentType, setAdjustmentType] =
    useState<CommercialAdjustmentType>("FIXED_DISCOUNT");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentLineKey, setAdjustmentLineKey] = useState("");
  const [serviceCharge, setServiceCharge] = useState("");
  const [serviceChargePercent, setServiceChargePercent] = useState(false);
  const [serviceChargeReason, setServiceChargeReason] = useState("Service charge");
  const [tip, setTip] = useState("");
  const [tipMethod, setTipMethod] = useState<"CASH" | "CARD" | "OTHER">("CARD");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCommercialCheck(check.id);
      setContext(next);
      setCheckType(next.profile?.checkType ?? "COUNTER_SALE");
      setTableReference(next.profile?.tableReference ?? "");
      setServiceArea(next.profile?.serviceArea ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load commercial controls.");
    } finally {
      setLoading(false);
    }
  }, [check.id]);

  useEffect(() => {
    void load();
  }, [load, check.version]);

  const adjustmentChoices = useMemo(() => {
    const choices: AdjustmentChoice[] = [];
    if (canDiscount) {
      choices.push(
        { value: "FIXED_DISCOUNT", label: "Fixed discount" },
        { value: "PERCENTAGE_DISCOUNT", label: "Percentage discount", needsPercent: true },
        { value: "PROMOTION", label: "Promotion" },
      );
    }
    if (canComp) choices.push({ value: "MANAGER_COMP", label: "Manager comp" });
    if (canPriceOverride) {
      choices.push({ value: "PRICE_OVERRIDE", label: "Price override", needsLine: true });
    }
    return choices;
  }, [canComp, canDiscount, canPriceOverride]);

  useEffect(() => {
    if (adjustmentChoices.length > 0 && !adjustmentChoices.some((item) => item.value === adjustmentType)) {
      setAdjustmentType(adjustmentChoices[0].value);
    }
  }, [adjustmentChoices, adjustmentType]);

  const currentVersion = context?.check.version ?? check.version;
  const selectedAdjustment = adjustmentChoices.find((item) => item.value === adjustmentType);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Commercial update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      updateCommercialCheckProfile(check.id, {
        expectedCheckVersion: currentVersion,
        checkType,
        tableReference: tableReference.trim() || undefined,
        serviceArea: serviceArea.trim() || undefined,
      }),
    );
  }

  async function transferArea() {
    if (!serviceArea.trim() || !transferReason.trim()) return;
    await run(() =>
      transferCommercialCheck(check.id, {
        expectedCheckVersion: currentVersion,
        serviceArea: serviceArea.trim(),
        reason: transferReason.trim(),
      }),
    );
    setTransferReason("");
  }

  async function addAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!selectedAdjustment || !adjustmentReason.trim()) return;
    const numeric = Number(adjustmentValue);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    const selectedLine = context?.projection?.lines.find(
      (line) => `${line.sourceType}:${line.sourceId}:${line.lineReference ?? ""}` === adjustmentLineKey,
    );
    await run(() =>
      applyCommercialAdjustment(check.id, {
        expectedCheckVersion: currentVersion,
        type: adjustmentType,
        scope: selectedAdjustment.needsLine ? "LINE" : "CHECK",
        amountMinor: selectedAdjustment.needsPercent ? undefined : toMinor(adjustmentValue) ?? 0,
        percentageBps: selectedAdjustment.needsPercent ? Math.round(numeric * 100) : undefined,
        targetSourceType: selectedLine?.sourceType,
        targetSourceId: selectedLine?.sourceId,
        targetLineReference: selectedLine?.lineReference ?? undefined,
        reason: adjustmentReason.trim(),
      }),
    );
    setAdjustmentValue("");
    setAdjustmentReason("");
  }

  async function addServiceCharge(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(serviceCharge);
    if (!Number.isFinite(numeric) || numeric <= 0 || !serviceChargeReason.trim()) return;
    await run(() =>
      addCommercialServiceCharge(check.id, {
        expectedCheckVersion: currentVersion,
        mode: serviceChargePercent ? "PERCENTAGE" : "FIXED",
        amountMinor: serviceChargePercent ? undefined : toMinor(serviceCharge) ?? undefined,
        percentageBps: serviceChargePercent ? Math.round(numeric * 100) : undefined,
        reason: serviceChargeReason.trim(),
      }),
    );
    setServiceCharge("");
  }

  async function addTip(event: FormEvent) {
    event.preventDefault();
    const amountMinor = toMinor(tip);
    if (!amountMinor) return;
    await run(() =>
      addCommercialTip(check.id, {
        expectedCheckVersion: currentVersion,
        method: tipMethod,
        amountMinor,
      }),
    );
    setTip("");
  }

  if (loading && !context) {
    return (
      <div className="flex items-center gap-2 border-b border-white/8 bg-black/10 px-4 py-3 text-xs text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading commercial controls…
      </div>
    );
  }

  const blockers = context?.projection?.blockers ?? [];

  return (
    <section className="border-b border-white/8 bg-zinc-950/35 px-4 py-3 sm:px-5" data-testid="phase4-commercial-controls">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300">
            <ReceiptText className="h-3.5 w-3.5 text-emerald-300" /> Commercial core
          </p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-600">
            One authoritative bill for session time, orders, services and merchandise. Fiscal documents remain separate.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40" aria-label="Refresh commercial controls">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {blockers.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-200">Finalize before payment</p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-amber-100/70">
            {blockers.map((blocker) => (
              <li key={`${blocker.type}:${blocker.id}`}>• {blocker.label} · {blocker.status.replaceAll("_", " ").toLowerCase()}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {canWrite ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <form onSubmit={(event) => void saveProfile(event)} className="rounded-xl border border-white/8 bg-black/15 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Tab context</p>
            <select value={checkType} onChange={(event) => setCheckType(event.target.value as CommercialCheckType)} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200">
              {CHECK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input value={tableReference} onChange={(event) => setTableReference(event.target.value)} placeholder="Table / tab reference" className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
            <input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder="Service area" className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={busy} className="min-h-9 flex-1 rounded-lg bg-white/[0.06] px-2 text-xs font-semibold text-zinc-200 hover:bg-white/[0.1] disabled:opacity-50">Save context</button>
            </div>
            <input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Reason to move service area" className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
            <button type="button" onClick={() => void transferArea()} disabled={busy || !serviceArea.trim() || !transferReason.trim()} className="mt-2 min-h-9 w-full rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-2 text-xs font-semibold text-sky-200 disabled:opacity-40">Transfer area</button>
          </form>

          {adjustmentChoices.length > 0 ? (
            <form onSubmit={(event) => void addAdjustment(event)} className="rounded-xl border border-white/8 bg-black/15 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500"><Percent className="h-3 w-3" /> Authorized adjustment</p>
              <select value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as CommercialAdjustmentType)} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200">
                {adjustmentChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {selectedAdjustment?.needsLine ? (
                <select value={adjustmentLineKey} onChange={(event) => setAdjustmentLineKey(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200">
                  <option value="">Choose line…</option>
                  {context?.projection?.lines.filter((line) => line.sourceType !== "TIP" && line.sourceType !== "SERVICE_CHARGE").map((line) => {
                    const key = `${line.sourceType}:${line.sourceId}:${line.lineReference ?? ""}`;
                    return <option key={key} value={key}>{line.description} · {line.finalAmount}</option>;
                  })}
                </select>
              ) : null}
              <input type="number" min="0" step="0.01" value={adjustmentValue} onChange={(event) => setAdjustmentValue(event.target.value)} placeholder={selectedAdjustment?.needsPercent ? "Percent" : "Amount"} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
              <input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Required reason" className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
              <button type="submit" disabled={busy || !adjustmentReason.trim() || !adjustmentValue || Boolean(selectedAdjustment?.needsLine && !adjustmentLineKey)} className="mt-2 min-h-9 w-full rounded-lg bg-emerald-400 px-2 text-xs font-bold text-zinc-950 disabled:opacity-40">Apply adjustment</button>
            </form>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <form onSubmit={(event) => void addServiceCharge(event)} className="rounded-xl border border-white/8 bg-black/15 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Service charge</p>
              <div className="mt-2 flex gap-2">
                <input type="number" min="0.01" step="0.01" value={serviceCharge} onChange={(event) => setServiceCharge(event.target.value)} placeholder={serviceChargePercent ? "Percent" : "Amount"} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
                <button type="button" onClick={() => setServiceChargePercent((value) => !value)} className="h-9 rounded-lg border border-white/10 px-2 text-[11px] text-zinc-400">{serviceChargePercent ? "%" : "Fixed"}</button>
              </div>
              <input value={serviceChargeReason} onChange={(event) => setServiceChargeReason(event.target.value)} placeholder="Reason" className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
              <button type="submit" disabled={busy || !serviceCharge} className="mt-2 min-h-9 w-full rounded-lg bg-white/[0.06] px-2 text-xs font-semibold text-zinc-200 disabled:opacity-40">Add charge</button>
            </form>

            <form onSubmit={(event) => void addTip(event)} className="rounded-xl border border-white/8 bg-black/15 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Gratuity</p>
              <div className="mt-2 flex gap-2">
                <input type="number" min="0.01" step="0.01" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="Amount" className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200" />
                <select value={tipMethod} onChange={(event) => setTipMethod(event.target.value as typeof tipMethod)} className="h-9 rounded-lg border border-white/10 bg-zinc-950 px-2 text-[11px] text-zinc-300">
                  <option value="CARD">Card</option><option value="CASH">Cash</option><option value="OTHER">Other</option>
                </select>
              </div>
              <button type="submit" disabled={busy || !tip} className="mt-2 min-h-9 w-full rounded-lg bg-white/[0.06] px-2 text-xs font-semibold text-zinc-200 disabled:opacity-40">Add gratuity</button>
            </form>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs leading-5 text-rose-300">{error}</p> : null}
    </section>
  );
}
