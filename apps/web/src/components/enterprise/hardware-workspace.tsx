"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Printer = { deviceId: string; adapter: string; host: string | null; port: number | null; paperWidthMm: number; enabled: boolean; lastError: string | null };
type PrintRoute = { id: string; name: string; jobType: string; sourceKey: string | null; printerDeviceId: string; priority: number; enabled: boolean };
type PrintJob = { id: string; type: string; sourceType: string; sourceId: string; status: string; attemptCount: number; maxAttempts: number; lastError: string | null; createdAt: string };
type Display = { id: string; displayDeviceId: string; posDeviceId: string | null; status: string; activeCheckId: string | null };
type Overview = { printers: Printer[]; routes: PrintRoute[]; recentJobs: PrintJob[]; displays: Display[]; barcodeAliasCount: number };

const JOB_TYPES = ["KITCHEN", "BAR", "CUSTOMER_RECEIPT", "INVOICE", "SHIFT", "LABEL"];

export function HardwareWorkspace() {
  const [data, setData] = useState<Overview>({ printers: [], routes: [], recentJobs: [], displays: [], barcodeAliasCount: 0 });
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

  const load = useCallback(async () => {
    try { setData(await api.get<Overview>("/hardware")); setMessage(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load hardware configuration."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function configurePrinter(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api.post("/hardware/printers/configure", {
        deviceId: deviceId.trim(), adapter: adapter.trim(),
        ...(host.trim() ? { host: host.trim() } : {}),
        ...(port.trim() ? { port: Number(port) } : {}), paperWidthMm: 80,
      });
      setMessage("Printer configured."); setDeviceId(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not configure printer."); }
    finally { setBusy(false); }
  }

  async function createRoute(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api.post("/hardware/print-routes", { name: routeName.trim(), jobType: routeType, printerDeviceId: routePrinterId.trim() });
      setRouteName(""); setMessage("Print route created."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create print route."); }
    finally { setBusy(false); }
  }

  async function retryJob(id: string) {
    setBusy(true);
    try { await api.post(`/hardware/print-jobs/${id}/retry`); await load(); setMessage("Print job requeued."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry print job."); }
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not bind customer display."); }
    finally { setBusy(false); }
  }

  async function saveBarcode(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api.post("/hardware/barcodes", { barcode: barcode.trim(), entityType: entityType.trim(), entityId: entityId.trim() });
      setBarcode(""); setEntityId(""); await load(); setMessage("Barcode alias saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save barcode alias."); }
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
          {data.printers.map((printer) => <div key={printer.deviceId} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3"><div className="text-sm font-medium text-zinc-100">{printer.deviceId}</div><div className="mt-1 text-xs text-zinc-500">{printer.adapter} · {printer.host ?? "local"}:{printer.port ?? "—"} · {printer.paperWidthMm} mm</div>{printer.lastError ? <div className="mt-1 text-xs text-rose-300">{printer.lastError}</div> : null}</div>)}
          {data.routes.map((route) => <div key={route.id} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3"><div className="text-sm font-medium text-zinc-100">{route.name}</div><div className="mt-1 text-xs text-zinc-500">{route.jobType} → {route.printerDeviceId}</div></div>)}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Recent print jobs</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-zinc-500"><tr><th className="p-2">Type</th><th className="p-2">Source</th><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Error</th><th className="p-2"></th></tr></thead><tbody>{data.recentJobs.map((job) => <tr key={job.id} className="border-t border-white/10"><td className="p-2 text-zinc-200">{job.type}</td><td className="p-2 text-zinc-400">{job.sourceType}:{job.sourceId}</td><td className="p-2 text-zinc-300">{job.status}</td><td className="p-2 text-zinc-400">{job.attemptCount}/{job.maxAttempts}</td><td className="max-w-sm truncate p-2 text-zinc-500">{job.lastError ?? "—"}</td><td className="p-2">{job.status === "FAILED" ? <button className="rounded border border-white/10 px-2 py-1 text-zinc-200" onClick={() => void retryJob(job.id)} disabled={busy}>Retry</button> : null}</td></tr>)}</tbody></table></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={bindDisplay} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h2 className="text-sm font-semibold text-zinc-100">Customer display</h2><div className="mt-3 space-y-3"><input className={input} value={displayId} onChange={(e) => setDisplayId(e.target.value)} placeholder="Customer display device ID" required /><input className={input} value={posId} onChange={(e) => setPosId(e.target.value)} placeholder="POS device ID (optional)" /><button className={button} disabled={busy}>Bind display</button></div>{displayToken ? <pre className="mt-3 overflow-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">{displayToken}</pre> : null}</form>
        <form onSubmit={saveBarcode} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h2 className="text-sm font-semibold text-zinc-100">Barcode alias</h2><p className="mt-1 text-xs text-zinc-500">{data.barcodeAliasCount} aliases configured.</p><div className="mt-3 space-y-3"><input className={input} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode" required /><input className={input} value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Entity type" required /><input className={input} value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Entity ID" required /><button className={button} disabled={busy}>Save alias</button></div></form>
      </section>
    </div>
  );
}
