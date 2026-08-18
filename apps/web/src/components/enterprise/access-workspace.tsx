"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";

type TicketProduct = {
  id: string;
  name: string;
  menuItemId: string | null;
  validityMinutes: number | null;
  maxScans: number;
  active: boolean;
};
type AccessZone = { id: string; code: string; name: string; capacity: number | null };
type ZoneOccupancy = { zoneId: string; count: number };
type Locker = { id: string; code: string; sizeType: string | null; availability: string };
type Overview = {
  products: TicketProduct[];
  zones: AccessZone[];
  occupancy: ZoneOccupancy[];
  activeCredentials: number;
  configuredScanners: number;
  lockers: Locker[];
  accessEvents: number;
  legacyWalletRows: number;
  financialAuthority: string;
};
type AccessScanResult = {
  event: { decision: string; reasonCode: string | null; zoneId: string; credentialId: string | null };
  occupancy: number;
};

type TicketFulfillmentResult = { rawTokens: string[]; replayed: boolean; tickets: Array<{ id: string }> };

function key(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

const input =
  "w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50";
const button =
  "rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded-xl border border-white/10 bg-white/[0.025] p-4";

export function AccessWorkspace() {
  const [data, setData] = useState<Overview>({
    products: [],
    zones: [],
    occupancy: [],
    activeCredentials: 0,
    configuredScanners: 0,
    lockers: [],
    accessEvents: 0,
    legacyWalletRows: 0,
    financialAuthority: "GuestCheck/Settlement + StoredValueLedgerEntry",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [oneTimeTokens, setOneTimeTokens] = useState<string[]>([]);
  const [scanResult, setScanResult] = useState<AccessScanResult | null>(null);

  const [ticketName, setTicketName] = useState("");
  const [ticketMenuItemId, setTicketMenuItemId] = useState("");
  const [ticketValidity, setTicketValidity] = useState("180");
  const [ticketScans, setTicketScans] = useState("1");
  const [settlementId, setSettlementId] = useState("");

  const [zoneCode, setZoneCode] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [zoneCapacity, setZoneCapacity] = useState("");
  const [scannerDeviceId, setScannerDeviceId] = useState("");
  const [scannerZoneId, setScannerZoneId] = useState("");
  const [scannerOfflineCache, setScannerOfflineCache] = useState(false);

  const [credentialToken, setCredentialToken] = useState("");
  const [credentialType, setCredentialType] = useState("RFID");
  const [credentialCustomerId, setCredentialCustomerId] = useState("");
  const [credentialMembershipId, setCredentialMembershipId] = useState("");
  const [credentialStoredValueId, setCredentialStoredValueId] = useState("");

  const [scanToken, setScanToken] = useState("");
  const [scanZoneId, setScanZoneId] = useState("");
  const [scanDirection, setScanDirection] = useState("ENTER");
  const [scanDeviceId, setScanDeviceId] = useState("");
  const [scanSequence, setScanSequence] = useState("");

  const [correctionZoneId, setCorrectionZoneId] = useState("");
  const [targetOccupancy, setTargetOccupancy] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [lockerCode, setLockerCode] = useState("");
  const [lockerSize, setLockerSize] = useState("");
  const [lockerRentalItemId, setLockerRentalItemId] = useState("");
  const [lockerDepositItemId, setLockerDepositItemId] = useState("");
  const [assignLockerId, setAssignLockerId] = useState("");
  const [assignCredentialId, setAssignCredentialId] = useState("");
  const [assignSettlementId, setAssignSettlementId] = useState("");
  const [overrideLockerId, setOverrideLockerId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const occupancyByZone = useMemo(
    () => new Map(data.occupancy.map((entry) => [entry.zoneId, entry.count])),
    [data.occupancy],
  );

  const load = useCallback(async () => {
    try {
      const overview = await api.get<Overview>("/ticketing");
      setData(overview);
      setMessage(null);
      setScannerZoneId((current) => current || overview.zones[0]?.id || "");
      setScanZoneId((current) => current || overview.zones[0]?.id || "");
      setCorrectionZoneId((current) => current || overview.zones[0]?.id || "");
      setAssignLockerId((current) => current || overview.lockers[0]?.id || "");
      setOverrideLockerId((current) => current || overview.lockers[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load access-control state.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTicketProduct(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/ticketing/products", {
        name: ticketName.trim(),
        menuItemId: ticketMenuItemId.trim(),
        ...(ticketValidity.trim() ? { validityMinutes: Number(ticketValidity) } : {}),
        maxScans: Number(ticketScans),
      });
      setTicketName("");
      setTicketMenuItemId("");
      setMessage("Ticket product linked to the canonical menu item.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create ticket product.");
    } finally {
      setBusy(false);
    }
  }

  async function fulfillTickets(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOneTimeTokens([]);
    try {
      const result = await api.post<TicketFulfillmentResult>("/ticketing/orders", {
        settlementId: settlementId.trim(),
        idempotencyKey: key("ticket-fulfillment"),
      });
      setOneTimeTokens(result.rawTokens ?? []);
      setMessage(
        result.replayed
          ? "This paid settlement was already fulfilled. Secret ticket tokens are not replayed."
          : `Issued ${result.tickets.length} access ticket(s) from the paid settlement.`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not fulfill access tickets.");
    } finally {
      setBusy(false);
    }
  }

  async function createZone(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/ticketing/zones", {
        code: zoneCode.trim(),
        name: zoneName.trim(),
        ...(zoneCapacity.trim() ? { capacity: Number(zoneCapacity) } : {}),
      });
      setZoneCode("");
      setZoneName("");
      setZoneCapacity("");
      setMessage("Access zone created.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create access zone.");
    } finally {
      setBusy(false);
    }
  }

  async function configureScanner(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/ticketing/scanners/${encodeURIComponent(scannerDeviceId.trim())}/configure`, {
        zoneId: scannerZoneId,
        allowOfflineCache: scannerOfflineCache,
        ...(scannerOfflineCache ? { offlineCacheTtlSeconds: 3600 } : {}),
        enforceSequence: true,
      });
      setMessage("Scanner assigned to the zone with explicit replay policy.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not configure scanner.");
    } finally {
      setBusy(false);
    }
  }

  async function bindCredential(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/ticketing/credentials", {
        token: credentialToken.trim(),
        type: credentialType,
        ...(credentialCustomerId.trim() ? { customerId: credentialCustomerId.trim() } : {}),
        ...(credentialMembershipId.trim() ? { membershipId: credentialMembershipId.trim() } : {}),
        ...(credentialStoredValueId.trim() ? { storedValueAccountId: credentialStoredValueId.trim() } : {}),
      });
      setCredentialToken("");
      setMessage("Credential bound to a canonical customer entitlement. Raw credential value is not stored.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not bind credential.");
    } finally {
      setBusy(false);
    }
  }

  async function scanAccess(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setScanResult(null);
    try {
      const result = await api.post<AccessScanResult>("/ticketing/access/scan", {
        token: scanToken.trim(),
        zoneId: scanZoneId,
        direction: scanDirection,
        idempotencyKey: key("access-scan"),
        ...(scanDeviceId.trim() ? { scannerDeviceId: scanDeviceId.trim() } : {}),
        ...(scanSequence.trim() ? { deviceSequence: Number(scanSequence) } : {}),
      });
      setScanResult(result);
      setMessage(`${result.event.decision}: ${result.event.reasonCode ?? "no reason code"}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not evaluate access credential.");
    } finally {
      setBusy(false);
    }
  }

  async function correctOccupancy(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/ticketing/zones/${correctionZoneId}/occupancy/correct`, {
        targetOccupancy: Number(targetOccupancy),
        reason: correctionReason.trim(),
        idempotencyKey: key("occupancy-correction"),
      });
      setTargetOccupancy("");
      setCorrectionReason("");
      setMessage("Occupancy corrected with an audited event delta.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not correct occupancy.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocker(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/ticketing/lockers", {
        code: lockerCode.trim(),
        ...(lockerSize.trim() ? { sizeType: lockerSize.trim() } : {}),
        ...(lockerRentalItemId.trim() ? { rentalMenuItemId: lockerRentalItemId.trim() } : {}),
        ...(lockerDepositItemId.trim() ? { depositMenuItemId: lockerDepositItemId.trim() } : {}),
      });
      setLockerCode("");
      setMessage("Locker created.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create locker.");
    } finally {
      setBusy(false);
    }
  }

  async function assignLocker(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/ticketing/lockers/${assignLockerId}/assign`, {
        credentialId: assignCredentialId.trim(),
        ...(assignSettlementId.trim() ? { settlementId: assignSettlementId.trim() } : {}),
        idempotencyKey: key("locker-assignment"),
      });
      setAssignCredentialId("");
      setAssignSettlementId("");
      setMessage("Locker assigned. Configured rental/deposit items require a paid canonical settlement.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not assign locker.");
    } finally {
      setBusy(false);
    }
  }

  async function overrideLocker(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/ticketing/lockers/${overrideLockerId}/events`, {
        type: "MANUAL_OVERRIDE",
        reason: overrideReason.trim(),
        idempotencyKey: key("locker-override"),
      });
      setOverrideReason("");
      setMessage("Manual locker override recorded in the audit trail.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record locker override.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
          {message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={card}><div className="text-xs text-zinc-500">Active credentials</div><div className="mt-1 text-2xl font-semibold text-zinc-100">{data.activeCredentials}</div></div>
        <div className={card}><div className="text-xs text-zinc-500">Configured scanners</div><div className="mt-1 text-2xl font-semibold text-zinc-100">{data.configuredScanners}</div></div>
        <div className={card}><div className="text-xs text-zinc-500">Access events</div><div className="mt-1 text-2xl font-semibold text-zinc-100">{data.accessEvents}</div></div>
        <div className={card}><div className="text-xs text-zinc-500">Financial authority</div><div className="mt-1 text-sm font-semibold text-emerald-300">Canonical GuestCheck / ledger</div></div>
      </section>

      {data.legacyWalletRows > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
          {data.legacyWalletRows} legacy RFID wallet row(s) remain for migration compatibility. New loads and spends use the canonical stored-value ledger and never this legacy balance.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createTicketProduct} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Ticket product</h2>
          <p className="mt-1 text-xs text-zinc-500">Links access fulfillment to an existing canonical menu item. Price is never entered here.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className={input} value={ticketName} onChange={(e) => setTicketName(e.target.value)} placeholder="Admission / VIP pass" required />
            <input className={input} value={ticketMenuItemId} onChange={(e) => setTicketMenuItemId(e.target.value)} placeholder="Canonical menu item ID" required />
            <input className={input} value={ticketValidity} onChange={(e) => setTicketValidity(e.target.value)} inputMode="numeric" placeholder="Validity minutes" />
            <input className={input} value={ticketScans} onChange={(e) => setTicketScans(e.target.value)} inputMode="numeric" placeholder="Maximum entries" required />
          </div>
          <button className={button + " mt-3"} disabled={busy}>Create ticket product</button>
        </form>

        <form onSubmit={fulfillTickets} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Fulfill paid tickets</h2>
          <p className="mt-1 text-xs text-zinc-500">Only PAID/CLOSED GuestCheck settlements can issue access entitlements.</p>
          <input className={input + " mt-3"} value={settlementId} onChange={(e) => setSettlementId(e.target.value)} placeholder="Paid settlement ID" required />
          <button className={button + " mt-3"} disabled={busy}>Issue access credentials</button>
          {oneTimeTokens.length ? (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-200">One-time ticket secrets — copy now</div>
              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all text-xs text-amber-100">{oneTimeTokens.join("\n")}</pre>
              <button type="button" className="mt-2 rounded border border-amber-400/30 px-2 py-1 text-xs text-amber-100" onClick={() => setOneTimeTokens([])}>Clear secrets</button>
            </div>
          ) : null}
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createZone} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Access zone</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className={input} value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} placeholder="VIP" required />
            <input className={input} value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="VIP lounge" required />
            <input className={input} value={zoneCapacity} onChange={(e) => setZoneCapacity(e.target.value)} inputMode="numeric" placeholder="Capacity (optional)" />
          </div>
          <button className={button + " mt-3"} disabled={busy}>Create zone</button>
        </form>

        <form onSubmit={configureScanner} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Scanner assignment</h2>
          <p className="mt-1 text-xs text-zinc-500">Device must be an active ACCESS_SCANNER in the venue Device Registry.</p>
          <div className="mt-3 space-y-3">
            <input className={input} value={scannerDeviceId} onChange={(e) => setScannerDeviceId(e.target.value)} placeholder="Scanner device ID" required />
            <select className={input} value={scannerZoneId} onChange={(e) => setScannerZoneId(e.target.value)} required>
              <option value="">Choose zone</option>{data.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
            <label className="flex items-start gap-2 text-xs text-zinc-300"><input type="checkbox" checked={scannerOfflineCache} onChange={(e) => setScannerOfflineCache(e.target.checked)} className="mt-0.5" /><span>Permit scanner credential-cache replay for one hour. This does not make checkout/payments offline-capable; full offline authority belongs to Phase 12.</span></label>
          </div>
          <button className={button + " mt-3"} disabled={busy}>Configure scanner</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-zinc-100">Live occupancy</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.zones.map((zone) => (
            <div key={zone.id} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
              <div className="text-sm font-medium text-zinc-100">{zone.name}</div>
              <div className="mt-1 text-xs text-zinc-500">{zone.code}</div>
              <div className="mt-2 text-xl font-semibold text-zinc-200">{occupancyByZone.get(zone.id) ?? 0}{zone.capacity != null ? ` / ${zone.capacity}` : ""}</div>
            </div>
          ))}
          {!data.zones.length ? <div className="text-sm text-zinc-500">No access zones configured.</div> : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={bindCredential} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">RFID / NFC / wristband</h2>
          <p className="mt-1 text-xs text-zinc-500">At least one canonical customer, membership, or stored-value account reference is required.</p>
          <div className="mt-3 space-y-3">
            <input className={input} type="password" autoComplete="off" value={credentialToken} onChange={(e) => setCredentialToken(e.target.value)} placeholder="Raw credential UID/token" required />
            <select className={input} value={credentialType} onChange={(e) => setCredentialType(e.target.value)}><option>RFID</option><option>NFC</option><option>WRISTBAND</option><option>MEMBERSHIP</option></select>
            <div className="grid gap-3 sm:grid-cols-3"><input className={input} value={credentialCustomerId} onChange={(e) => setCredentialCustomerId(e.target.value)} placeholder="Customer ID" /><input className={input} value={credentialMembershipId} onChange={(e) => setCredentialMembershipId(e.target.value)} placeholder="Membership ID" /><input className={input} value={credentialStoredValueId} onChange={(e) => setCredentialStoredValueId(e.target.value)} placeholder="Stored-value account ID" /></div>
          </div>
          <button className={button + " mt-3"} disabled={busy}>Bind credential</button>
        </form>

        <form onSubmit={scanAccess} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Access check</h2>
          <div className="mt-3 space-y-3">
            <input className={input} type="password" autoComplete="off" value={scanToken} onChange={(e) => setScanToken(e.target.value)} placeholder="Ticket / credential token" required />
            <div className="grid gap-3 sm:grid-cols-2"><select className={input} value={scanZoneId} onChange={(e) => setScanZoneId(e.target.value)} required><option value="">Choose zone</option>{data.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select><select className={input} value={scanDirection} onChange={(e) => setScanDirection(e.target.value)}><option>ENTER</option><option>EXIT</option><option>VERIFY</option></select></div>
            <div className="grid gap-3 sm:grid-cols-2"><input className={input} value={scanDeviceId} onChange={(e) => setScanDeviceId(e.target.value)} placeholder="Scanner ID (optional manual test)" /><input className={input} value={scanSequence} onChange={(e) => setScanSequence(e.target.value)} inputMode="numeric" placeholder="Device sequence" /></div>
          </div>
          <button className={button + " mt-3"} disabled={busy}>Evaluate access</button>
          {scanResult ? <div className="mt-3 rounded-md border border-white/10 bg-zinc-950/50 p-3 text-xs text-zinc-300"><strong>{scanResult.event.decision}</strong> · {scanResult.event.reasonCode ?? "—"} · occupancy {scanResult.occupancy}</div> : null}
        </form>
      </section>

      <form onSubmit={correctOccupancy} className={card}>
        <h2 className="text-sm font-semibold text-zinc-100">Occupancy correction</h2>
        <p className="mt-1 text-xs text-zinc-500">Use only for missing exit/device exceptions. Corrections append an event and audit trail; they do not overwrite history.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select className={input} value={correctionZoneId} onChange={(e) => setCorrectionZoneId(e.target.value)} required><option value="">Choose zone</option>{data.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>
          <input className={input} value={targetOccupancy} onChange={(e) => setTargetOccupancy(e.target.value)} inputMode="numeric" placeholder="Correct occupancy" required />
          <input className={input} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Reason" required />
        </div>
        <button className={button + " mt-3"} disabled={busy}>Record correction</button>
      </form>

      <section className="grid gap-4 xl:grid-cols-3">
        <form onSubmit={createLocker} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Create locker</h2>
          <div className="mt-3 space-y-3"><input className={input} value={lockerCode} onChange={(e) => setLockerCode(e.target.value)} placeholder="Locker code" required /><input className={input} value={lockerSize} onChange={(e) => setLockerSize(e.target.value)} placeholder="Size / type" /><input className={input} value={lockerRentalItemId} onChange={(e) => setLockerRentalItemId(e.target.value)} placeholder="Rental menu item ID" /><input className={input} value={lockerDepositItemId} onChange={(e) => setLockerDepositItemId(e.target.value)} placeholder="Deposit menu item ID" /></div>
          <button className={button + " mt-3"} disabled={busy}>Create locker</button>
        </form>
        <form onSubmit={assignLocker} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Assign locker</h2>
          <div className="mt-3 space-y-3"><select className={input} value={assignLockerId} onChange={(e) => setAssignLockerId(e.target.value)} required><option value="">Choose locker</option>{data.lockers.map((locker) => <option key={locker.id} value={locker.id}>{locker.code} · {locker.availability}</option>)}</select><input className={input} value={assignCredentialId} onChange={(e) => setAssignCredentialId(e.target.value)} placeholder="Access credential ID" required /><input className={input} value={assignSettlementId} onChange={(e) => setAssignSettlementId(e.target.value)} placeholder="Paid settlement ID if rental/deposit configured" /></div>
          <button className={button + " mt-3"} disabled={busy}>Assign locker</button>
        </form>
        <form onSubmit={overrideLocker} className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Manual locker override</h2>
          <p className="mt-1 text-xs text-zinc-500">High-risk physical override. A reason is mandatory and recorded in audit.</p>
          <div className="mt-3 space-y-3"><select className={input} value={overrideLockerId} onChange={(e) => setOverrideLockerId(e.target.value)} required><option value="">Choose locker</option>{data.lockers.map((locker) => <option key={locker.id} value={locker.id}>{locker.code}</option>)}</select><input className={input} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Override reason" required /></div>
          <button className={button + " mt-3"} disabled={busy}>Record override</button>
        </form>
      </section>
    </div>
  );
}
