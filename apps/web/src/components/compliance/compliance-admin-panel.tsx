"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  configureComplianceProfile,
  fetchComplianceProfile,
  fetchComplianceReconciliation,
  fetchFiscalDevices,
  fetchTaxCategories,
  upsertFiscalDevice,
  upsertTaxCategory,
  type ComplianceProfile,
  type ComplianceReconciliation,
  type FiscalDevice,
  type TaxCategory,
} from "@/lib/compliance-client";

export function ComplianceAdminPanel({ canManage }: { canManage: boolean }) {
  const [profile, setProfile] = useState<ComplianceProfile | null>(null);
  const [taxes, setTaxes] = useState<TaxCategory[]>([]);
  const [devices, setDevices] = useState<FiscalDevice[]>([]);
  const [reconciliation, setReconciliation] = useState<ComplianceReconciliation | null>(null);
  const [notApplicable, setNotApplicable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [defaultTaxCategoryCode, setDefaultTaxCategoryCode] = useState("");
  const [ksefEnvironment, setKsefEnvironment] = useState<"TEST" | "DEMO" | "PRD">("TEST");
  const [ksefToken, setKsefToken] = useState("");
  const [taxCode, setTaxCode] = useState("VAT23");
  const [taxLabel, setTaxLabel] = useState("VAT 23%");
  const [taxRate, setTaxRate] = useState("23");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [deviceProvider, setDeviceProvider] = useState("HTTP_BRIDGE");
  const [deviceExternalId, setDeviceExternalId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextTaxes, nextDevices] = await Promise.all([
        fetchComplianceProfile(),
        fetchTaxCategories(),
        fetchFiscalDevices(),
      ]);
      setProfile(nextProfile);
      setTaxes(nextTaxes);
      setDevices(nextDevices);
      setNotApplicable(false);
      if (nextProfile) {
        setLegalName(nextProfile.legalName);
        setTaxId(nextProfile.taxId);
        setStreetAddress(nextProfile.streetAddress);
        setPostalCode(nextProfile.postalCode);
        setCity(nextProfile.city);
        setDefaultTaxCategoryCode(nextProfile.defaultTaxCategoryCode ?? "");
        setKsefEnvironment(nextProfile.ksefEnvironment);
      }
      try {
        setReconciliation(await fetchComplianceReconciliation());
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 403)) throw cause;
        setReconciliation(null);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setNotApplicable(true);
        setProfile(null);
        setReconciliation(null);
      } else {
        setError(cause instanceof Error ? cause.message : "Could not load compliance diagnostics.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const actionRows = useMemo(
    () => reconciliation?.rows.filter((row) => row.complianceState === "ACTION_REQUIRED" || !row.documentId) ?? [],
    [reconciliation],
  );

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label); setError(null); setMessage(null);
    try { await action(); await load(); setMessage("Saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Compliance action failed."); }
    finally { setBusy(null); }
  };

  if (loading && !profile) return <div className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">Loading Poland compliance…</div>;
  if (notApplicable) return <div className="rounded-2xl border border-border p-6"><p className="font-semibold">Poland compliance is not applicable to this venue.</p><p className="mt-1 text-sm text-muted-foreground">The fiscal/KSeF adapter remains isolated from non-Poland venues.</p></div>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Paid settlements" value={String(reconciliation?.totalPaidSettlements ?? 0)} good />
        <Metric label="Missing fiscal document" value={String(reconciliation?.missingDocument ?? 0)} warn={(reconciliation?.missingDocument ?? 0) > 0} />
        <Metric label="Action required" value={String(reconciliation?.actionRequired ?? 0)} warn={(reconciliation?.actionRequired ?? 0) > 0} />
      </div>

      {canManage ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">Poland compliance profile</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Legal identity and KSeF credentials. The token is encrypted at rest and never returned by the API.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input label="Legal name" value={legalName} onChange={setLegalName} />
            <Input label="NIP" value={taxId} onChange={(v) => setTaxId(v.replace(/\D/g, "").slice(0, 10))} />
            <Input label="Street address" value={streetAddress} onChange={setStreetAddress} />
            <Input label="Postal code" value={postalCode} onChange={setPostalCode} />
            <Input label="City" value={city} onChange={setCity} />
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">Default tax category</span><select value={defaultTaxCategoryCode} onChange={(e) => setDefaultTaxCategoryCode(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2"><option value="">None — require line mapping</option>{taxes.filter((t) => t.active).map((t) => <option key={t.id} value={t.code}>{t.code} · {t.ratePercent}%</option>)}</select></label>
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">KSeF environment</span><select value={ksefEnvironment} onChange={(e) => setKsefEnvironment(e.target.value as "TEST" | "DEMO" | "PRD")} className="w-full rounded-xl border border-border bg-background px-3 py-2"><option>TEST</option><option>DEMO</option><option>PRD</option></select></label>
            <Input label={profile?.hasKsefToken ? "Replace KSeF token (optional)" : "KSeF token"} value={ksefToken} onChange={setKsefToken} type="password" />
          </div>
          <button onClick={() => void run("profile", () => configureComplianceProfile({ legalName, taxId, streetAddress, postalCode, city, defaultTaxCategoryCode: defaultTaxCategoryCode || undefined, ksefEnvironment, ksefToken: ksefToken || undefined }))} disabled={Boolean(busy)} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">Save compliance profile</button>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold">Tax categories</h2>
          <div className="mt-3 space-y-2">{taxes.map((tax) => <div key={tax.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"><span>{tax.code} · {tax.label}</span><span className={tax.active ? "text-emerald-400" : "text-muted-foreground"}>{tax.ratePercent}%</span></div>)}</div>
          {canManage ? <div className="mt-4 grid grid-cols-3 gap-2"><Input label="Code" value={taxCode} onChange={setTaxCode} /><Input label="Label" value={taxLabel} onChange={setTaxLabel} /><Input label="Rate %" value={taxRate} onChange={setTaxRate} /><button onClick={() => void run("tax", () => upsertTaxCategory({ code: taxCode, label: taxLabel, ratePercent: taxRate }))} className="col-span-3 rounded-xl border border-border px-3 py-2 text-sm font-semibold">Add / update tax category</button></div> : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold">Fiscal devices</h2>
          <div className="mt-3 space-y-2">{devices.map((device) => <div key={device.id} className="rounded-xl border border-border px-3 py-2 text-sm"><div className="flex justify-between"><span>{device.label}</span><span>{device.provider}</span></div><p className="text-xs text-muted-foreground">{device.externalDeviceId ?? "No external id"} · {device.enabled ? "Enabled" : "Disabled"}</p></div>)}</div>
          {canManage ? <div className="mt-4 grid gap-2"><Input label="Device label" value={deviceLabel} onChange={setDeviceLabel} /><Input label="Provider (SIMULATED or HTTP_BRIDGE)" value={deviceProvider} onChange={setDeviceProvider} /><Input label="External device id" value={deviceExternalId} onChange={setDeviceExternalId} /><button onClick={() => void run("device", () => upsertFiscalDevice({ label: deviceLabel, provider: deviceProvider, externalDeviceId: deviceExternalId || undefined }))} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Register fiscal device</button></div> : null}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Fiscal reconciliation</h2><p className="text-sm text-muted-foreground">Paid settlements compared with immutable fiscal/KSeF documents.</p></div><button onClick={() => void load()} className="rounded-xl border border-border p-2"><RefreshCw className="h-4 w-4" /></button></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-muted-foreground"><tr><th className="py-2">Settlement</th><th>Amount</th><th>Fiscal state</th><th>Document</th><th>KSeF</th><th>Issue</th></tr></thead><tbody>{(reconciliation?.rows ?? []).map((row) => <tr key={row.settlementId} className="border-t border-border"><td className="py-2 font-mono text-xs">{row.settlementId.slice(0, 12)}</td><td>{row.currency} {row.amount}</td><td>{row.complianceState}</td><td>{row.documentNumber ?? "Missing"}</td><td>{row.ksefNumber ?? "—"}</td><td className="max-w-xs truncate text-amber-300">{row.lastError ?? (row.actionRequired ? "Action required" : "")}</td></tr>)}</tbody></table></div>
        {!reconciliation?.rows.length ? <p className="mt-4 text-sm text-muted-foreground">No paid settlement reconciliation rows yet.</p> : null}
        {actionRows.length ? <p className="mt-3 text-xs text-amber-300">{actionRows.length} settlement(s) need fiscal review.</p> : null}
      </section>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
    </div>
  );
}

function Metric({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span>{warn ? <AlertTriangle className="h-4 w-4 text-amber-400" /> : good ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : null}</div><p className="mt-2 text-2xl font-black">{value}</p></div>;
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="space-y-1 text-sm"><span className="text-muted-foreground">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" /></label>;
}
