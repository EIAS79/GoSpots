"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Printer = { deviceId: string; adapter: string; host: string | null; port: number | null; paperWidthMm: number; enabled: boolean; lastError: string | null };
type PrintRoute = { id: string; name: string; jobType: string; sourceKey: string | null; printerDeviceId: string; priority: number; enabled: boolean };
type PrintJob = { id: string; type: string; sourceType: string; sourceId: string; status: string; attemptCount: number; maxAttempts: number; lastError: string | null; lastErrorCode: string | null; claimedAt: string | null; createdAt: string };
type PrintIncident = { id: string; shopId: string; type: string; status: string; sourceType: string; sourceId: string; printerDeviceId: string; claimedByEdgeDeviceId: string | null; claimedAt: string | null; printingAt: string | null; printedAt: string | null; lastErrorCode: string | null; lastError: string | null; attemptCount: number; createdAt: string; updatedAt: string };
type IncidentEvent = { id: string; kind: string; reason: string; actorUserId: string | null; occurredAt: string; evidence: { method?: string; reference?: string; observedAt?: string; notes?: string } | null; physicalOutcome: string | null };
type IncidentCase = { id: string; state: string; version: number; physicalOutcome: string | null; events: IncidentEvent[] };
type IncidentHistory = { originalJob: { id: string; status: string; printedAt: string | null }; incident: IncidentCase | null };
type PrintIncidentPage = { items: PrintIncident[]; hasMore: boolean; nextCursor: string | null };
type Display = { id: string; displayDeviceId: string; posDeviceId: string | null; status: string; activeCheckId: string | null };
type Overview = { printers: Printer[]; routes: PrintRoute[]; recentJobs: PrintJob[]; displays: Display[]; barcodeAliasCount: number };

const JOB_TYPES = ["KITCHEN", "BAR", "CUSTOMER_RECEIPT", "INVOICE", "SHIFT", "LABEL"];

// Render only allowlisted operator diagnostics, even against a stale API release.
function operatorReason(code: string | null, detail: string | null): string {
  if (code === "EDGE_PRINT_OUTCOME_UNKNOWN" || code === "EDGE_PRINT_LEASE_EXPIRED")
    return "Physical output is uncertain. Inspect the paper before any action.";
  if (code === "UNSUPPORTED_PRINTER_ADAPTER")
    return "Printer adapter is unsupported. Check the device configuration.";
  return detail || code ? "Printer issue. Contact a hardware administrator." : "—";
}

function operatorCode(code: string | null): string {
  return ["EDGE_PRINT_OUTCOME_UNKNOWN", "EDGE_PRINT_LEASE_EXPIRED", "UNSUPPORTED_PRINTER_ADAPTER"].includes(code ?? "")
    ? code! : code ? "PRINT_ERROR_REVIEW" : "—";
}


export function HardwareWorkspace() {
  const [data, setData] = useState<Overview>({ printers: [], routes: [], recentJobs: [], displays: [], barcodeAliasCount: 0 });
  const [incidents, setIncidents] = useState<PrintIncident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [caseLookupId, setCaseLookupId] = useState("");
  const [caseHistory, setCaseHistory] = useState<IncidentHistory | null>(null);
  const [incidentReason, setIncidentReason] = useState("");
  const [evidenceMethod, setEvidenceMethod] = useState("VISUAL_INSPECTION");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [evidenceTime, setEvidenceTime] = useState("");
  const [decisionOutcome, setDecisionOutcome] = useState("UNDETERMINED");
  const [caseMessage, setCaseMessage] = useState<string | null>(null);
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseKey, setCaseKey] = useState<string | null>(null);
  const [incidentCursor, setIncidentCursor] = useState<string | null>(null);
  const [incidentHasMore, setIncidentHasMore] = useState(false);
  const [incidentLoading, setIncidentLoading] = useState(true);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [adapter, setAdapter] = useState("tcp-escpos");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9100");
  const [routeName, setRouteName] = useState("");
  const [routeType, setRouteType] = useState("CUSTOMER_RECEIPT");
  const [routePrinterId, setRoutePrinterId] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [posId, setPosId] = useState("");
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [entityType, setEntityType] = useState("MENU_ITEM");
  const [entityId, setEntityId] = useState("");

  const fetchIncidentPage = useCallback((cursor?: string) =>
    api.get<PrintIncidentPage>(`/hardware/print-incidents?take=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), []);

  const load = useCallback(async () => {
    setIncidentLoading(true);
    try {
      const [overview, page] = await Promise.all([
        api.get<Overview>("/hardware").catch(() => null), fetchIncidentPage(),
      ]);
      if (overview) setData(overview);
      setIncidents(page.items); setIncidentCursor(page.nextCursor);
      setIncidentHasMore(page.hasMore); setIncidentError(null); setMessage(null);
    } catch {
      const reason = "Unable to retrieve hardware information. Check access or try again.";
      setIncidentError(reason); setMessage(reason);
    } finally { setIncidentLoading(false); }
  }, [fetchIncidentPage]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const [overview, page] = await Promise.all([
          api.get<Overview>("/hardware").catch(() => null), fetchIncidentPage(),
        ]);
        if (cancelled) return;
        if (overview) setData(overview);
        setIncidents(page.items); setIncidentCursor(page.nextCursor);
        setIncidentHasMore(page.hasMore); setIncidentError(null);
      } catch {
        if (!cancelled) setIncidentError("Unable to retrieve hardware information. Check access or try again.");
      } finally {
        if (!cancelled) setIncidentLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [fetchIncidentPage]);

  async function loadMoreIncidents() {
    if (!incidentCursor || incidentLoading) return;
    setIncidentLoading(true);
    try {
      const page = await fetchIncidentPage(incidentCursor);
      setIncidents((previous) => {
        const known = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !known.has(item.id))];
      });
      setIncidentCursor(page.nextCursor); setIncidentHasMore(page.hasMore); setIncidentError(null);
    } catch {
      setIncidentError("Unable to retrieve more incidents. Try again.");
    } finally { setIncidentLoading(false); }
  }

  async function inspectIncident(id: string) {
    setSelectedIncident(id); setCaseMessage(null); setCaseHistory(null);
    try {
      const history = await api.get<IncidentHistory>(`/hardware/print-incidents/${encodeURIComponent(id)}/case`);
      setCaseHistory(history);
      setCaseKey(null);
    } catch { setCaseMessage("Investigation history unavailable or access denied."); }
  }

  async function submitIncidentAction(kind: "investigate" | "evidence" | "decision") {
    if (!selectedIncident || !caseHistory || caseBusy) return;
    const expectedVersion = caseHistory.incident?.version ?? 1;
    const idempotencyKey = caseKey ?? crypto.randomUUID();
    if (!caseKey) setCaseKey(idempotencyKey);
    const body: Record<string, unknown> = {
      expectedVersion, idempotencyKey, reason: incidentReason.trim(),
    };
    if (kind === "evidence") {
      const observed = Date.parse(evidenceTime);
      if (!Number.isFinite(observed)) {
        setCaseMessage("A valid physical inspection time is required.");
        return;
      }
      Object.assign(body, {
        method: evidenceMethod, reference: evidenceReference.trim(),
        observedAt: new Date(observed).toISOString(),
      });
    }
    if (kind === "decision") body.physicalOutcome = decisionOutcome;
    setCaseBusy(true);
    try {
      await api.post(`/hardware/print-incidents/${encodeURIComponent(selectedIncident)}/${kind}`, body);
      setCaseKey(null);
      setCaseMessage("Decision and evidence recorded; no printing action was triggered.");
      await inspectIncident(selectedIncident);
      await load();
    } catch {
      setCaseMessage("Action denied, conflicted or invalid. Refresh the record before any new decision.");
    } finally { setCaseBusy(false); }
  }

  async function configurePrinter(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api.post("/hardware/printers/configure", {
        deviceId: deviceId.trim(), adapter: adapter.trim(),
        ...(host.trim() ? { host: host.trim() } : {}),
        ...(port.trim() ? { port: Number(port) } : {}), paperWidthMm: 80,
      });
      setMessage("Printer configured."); setDeviceId(""); await load();
    } catch { setMessage("Could not configure printer. Verify settings and access."); }
    finally { setBusy(false); }
  }

  async function createRoute(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api.post("/hardware/print-routes", { name: routeName.trim(), jobType: routeType, printerDeviceId: routePrinterId.trim() });
      setRouteName(""); setMessage("Print route created."); await load();
    } catch { setMessage("Could not create print route. Verify settings and access."); }
    finally { setBusy(false); }
  }

  async function retryJob(id: string) {
    setBusy(true);
    try { await api.post(`/hardware/print-jobs/${id}/retry`); await load(); setMessage("Print job requeued."); }
    catch { setMessage("Print retry was not authorized or did not succeed. Check whether the outcome is uncertain."); }
    finally { setBusy(false); }
  }

  async function bindDisplay(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.post<{ token: string }>("/hardware/customer-displays/bind", {
        displayDeviceId: displayId.trim(), ...(posId.trim() ? { posDeviceId: posId.trim() } : {}),
      });
      setDisplayToken(result.token); setDisplayId(""); setPosId(""); await load();
      setMessage("Customer display bound. Copy the display token now.");
    } catch { setMessage("Could not bind customer display. Verify the device and access."); }
    finally { setBusy(false); }
  }

  async function saveBarcode(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api.post("/hardware/barcodes", { barcode: barcode.trim(), entityType: entityType.trim(), entityId: entityId.trim() });
      setBarcode(""); setEntityId(""); await load(); setMessage("Barcode alias saved.");
    } catch { setMessage("Could not save barcode alias. Verify the item and access."); }
    finally { setBusy(false); }
  }

  const input = "w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50";
  const button = "rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{message}</div> : null}
      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={configurePrinter} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Printer configuration</h2>
          <p className="mt-1 text-xs text-zinc-500">Use the Device Registry printer ID. The Edge Hub currently supports the TCP ESC/POS adapter foundation.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><input className={input} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="Printer device ID" required /><input className={input} value={adapter} onChange={(e) => setAdapter(e.target.value)} placeholder="tcp-escpos" /><input className={input} value={host} onChange={(e) => setHost(e.target.value)} placeholder="Printer host / IP" /><input className={input} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" placeholder="9100" /></div>
          <button className={button + " mt-3"} disabled={busy}>Configure printer</button>
        </form>
        <form onSubmit={createRoute} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Print routing</h2>
          <div className="mt-3 space-y-3"><input className={input} value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Route name" required /><select className={input} value={routeType} onChange={(e) => setRouteType(e.target.value)}>{JOB_TYPES.map((type) => <option key={type}>{type}</option>)}</select><input className={input} value={routePrinterId} onChange={(e) => setRoutePrinterId(e.target.value)} placeholder="Configured printer device ID" required /><button className={button} disabled={busy}>Create route</button></div>
        </form>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Printers & routes</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {data.printers.map((printer) => <div key={printer.deviceId} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3"><div className="text-sm font-medium text-zinc-100">{printer.deviceId}</div><div className="mt-1 text-xs text-zinc-500">{printer.adapter} · {printer.host ?? "local"}:{printer.port ?? "—"} · {printer.paperWidthMm} mm</div>{printer.lastError ? <div className="mt-1 text-xs text-rose-300">Printer issue. Check device configuration.</div> : null}</div>)}
          {data.routes.map((route) => <div key={route.id} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3"><div className="text-sm font-medium text-zinc-100">{route.name}</div><div className="mt-1 text-xs text-zinc-500">{route.jobType} → {route.printerDeviceId}</div></div>)}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Print incidents requiring physical review · {incidents.length} loaded{incidentHasMore ? "+" : ""}</h2>
        <p className="mt-1 text-xs text-amber-200">Potentially printed; physically inspect before escalating. Do not reprint automatically. Fiscal or invoice output requires fiscal-owner review. Older incidents remain accessible through Load more. Uncertain is not a proven failure.</p>
        <div className="mt-3 space-y-2">{incidents.map((incident) => <div key={incident.id} className="rounded border border-amber-500/20 p-2 text-xs text-zinc-300">{incident.id} · {incident.type} · {incident.status}<div>Venue {incident.shopId} · Source {incident.sourceType}:{incident.sourceId}</div><div>Original Edge {incident.claimedByEdgeDeviceId ?? "—"} · Target printer {incident.printerDeviceId}</div><div>Claimed {incident.claimedAt ?? "—"} · Dispatch {incident.printingAt ?? "—"}</div><div>Reason {operatorCode(incident.lastErrorCode)}: {operatorReason(incident.lastErrorCode, incident.lastError)}</div></div>)}</div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-52 flex-1 text-xs">Original job ID (including archived / late-acknowledged incidents)
            <input className={input} value={caseLookupId} onChange={(e) => setCaseLookupId(e.target.value)} placeholder="Original print job ID" maxLength={128} />
          </label>
          <button type="button" className={button} disabled={!caseLookupId.trim() || caseBusy} onClick={() => void inspectIncident(caseLookupId.trim())}>Open incident history</button>
        </div>
        <div className="mt-3 space-y-2">
          <label htmlFor="t009-incident-select" className="text-xs text-zinc-300">Review original print job</label>
          <select id="t009-incident-select" className={input} value={selectedIncident ?? ""} onChange={(e) => void inspectIncident(e.target.value)}>
            <option value="">Select an unresolved job</option>
            {incidents.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.type}</option>)}
          </select>
          {caseMessage ? <p role="status" className="text-amber-200">{caseMessage}</p> : null}
          {selectedIncident && caseHistory ? <div className="rounded border border-white/20 p-3 space-y-3">
            <h3 className="font-semibold text-zinc-100">Physical incident investigation — no reprint authorization</h3>
            <p>Original job: {caseHistory.originalJob.id} · State: {caseHistory.incident?.state ?? "OPEN"} · Version: {caseHistory.incident?.version ?? 1}</p>
            <p>Classification: {caseHistory.incident?.physicalOutcome ?? "Not recorded"}. An uncertain physical print remains quarantined, regardless of classification.</p>
            <label className="block">Reason (required, 8–1000 characters)
              <textarea className={input} value={incidentReason} onChange={(e) => setIncidentReason(e.target.value)} maxLength={1000} />
            </label>
            {!caseHistory.incident || caseHistory.incident.state === "OPEN" ?
              <button type="button" className={button} disabled={caseBusy} onClick={() => void submitIncidentAction("investigate")}>Begin authorized investigation</button> : null}
            {caseHistory.incident?.state === "INVESTIGATING" ? <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label>Evidence method<select className={input} value={evidenceMethod} onChange={(e) => setEvidenceMethod(e.target.value)}>
                  {["VISUAL_INSPECTION", "PRINTER_STATUS", "EDGE_JOURNAL", "OPERATOR_REPORT"].map((m) => <option key={m}>{m}</option>)}
                </select></label>
                <label>Evidence reference<input className={input} value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} /></label>
                <label>Observed date/time<input className={input} type="datetime-local" value={evidenceTime} onChange={(e) => setEvidenceTime(e.target.value)} /></label>
              </div>
              <button type="button" className={button} disabled={caseBusy} onClick={() => void submitIncidentAction("evidence")}>Record physical evidence</button>
              <label className="block">Verified physical outcome
                <select className={input} value={decisionOutcome} onChange={(e) => setDecisionOutcome(e.target.value)}>
                  {["UNDETERMINED", "CONFIRMED_PRINTED", "CONFIRMED_NOT_PRINTED"].map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
              <p className="text-xs text-amber-200">Classification records an investigation only. It never clears claims, queues a job or authorizes physical reprinting.</p>
              <button type="button" className={button} disabled={caseBusy} onClick={() => void submitIncidentAction("decision")}>Record outcome (no reprint)</button>
            </> : null}
            <h4 className="font-semibold">Immutable case history</h4>
            {caseHistory.incident?.events.map((ev) =>
              <div key={ev.id} className="rounded border border-white/10 p-2 text-xs">{ev.occurredAt} · {ev.kind} · {ev.actorUserId ?? "SYSTEM"} · {ev.reason}
                {ev.physicalOutcome ? <div>Classification: {ev.physicalOutcome}</div> : null}
                {ev.evidence ? <div>Evidence: {ev.evidence.method} / {ev.evidence.reference}</div> : null}
              </div>)}
          </div> : null}
        </div>
        {incidentLoading ? <p role="status" className="mt-2 text-xs text-zinc-400">Loading print incidents…</p> : null}
        {incidentError ? <p role="alert" className="mt-2 text-xs text-rose-300">Incident loading failed: {incidentError}</p> : null}
        {!incidentLoading && !incidentError && incidents.length === 0 ? <p className="mt-2 text-xs text-zinc-400">No unresolved physical print incidents.</p> : null}
        {incidentHasMore ? <button type="button" className="mt-3 rounded border border-white/20 px-3 py-1 text-xs text-zinc-100 disabled:opacity-50" onClick={() => void loadMoreIncidents()} disabled={incidentLoading}>Load more incidents</button> : null}
        {incidentError && incidents.length === 0 ? <button type="button" className="mt-3 rounded border border-white/20 px-3 py-1 text-xs text-zinc-100" onClick={() => void load()}>Retry loading incidents</button> : null}
      </section>
      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Recent print jobs</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-zinc-500"><tr><th className="p-2">Type</th><th className="p-2">Source</th><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Error</th><th className="p-2"></th></tr></thead><tbody>{data.recentJobs.map((job) => <tr key={job.id} className="border-t border-white/10"><td className="p-2 text-zinc-200">{job.type}</td><td className="p-2 text-zinc-400">{job.sourceType}:{job.sourceId}</td><td className="p-2 text-zinc-300">{job.status}</td><td className="p-2 text-zinc-400">{job.attemptCount}/{job.maxAttempts}</td><td className="max-w-sm truncate p-2 text-zinc-500">{operatorReason(job.lastErrorCode, job.lastError)}</td><td className="p-2">{job.status === "FAILED" && !job.claimedAt && !["EDGE_PRINT_OUTCOME_UNKNOWN", "EDGE_PRINT_LEASE_EXPIRED"].includes(job.lastErrorCode ?? "") ? <button className="rounded border border-white/10 px-2 py-1 text-zinc-200" onClick={() => void retryJob(job.id)} disabled={busy}>Retry</button> : null}</td></tr>)}</tbody></table></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={bindDisplay} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h2 className="text-sm font-semibold text-zinc-100">Customer display</h2><div className="mt-3 space-y-3"><input className={input} value={displayId} onChange={(e) => setDisplayId(e.target.value)} placeholder="Customer display device ID" required /><input className={input} value={posId} onChange={(e) => setPosId(e.target.value)} placeholder="POS device ID (optional)" /><button className={button} disabled={busy}>Bind display</button></div>{displayToken ? <pre className="mt-3 overflow-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">{displayToken}</pre> : null}</form>
        <form onSubmit={saveBarcode} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h2 className="text-sm font-semibold text-zinc-100">Barcode alias</h2><p className="mt-1 text-xs text-zinc-500">{data.barcodeAliasCount} aliases configured.</p><div className="mt-3 space-y-3"><input className={input} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode" required /><input className={input} value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Entity type" required /><input className={input} value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Entity ID" required /><button className={button} disabled={busy}>Save alias</button></div></form>
      </section>
    </div>
  );
}
