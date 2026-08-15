"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { api } from "@/lib/api";
import {
  fetchOperationsFloor,
  finishOperationsSession,
  startOperationsSession,
  type OperationsFloorView,
  type OperationsSessionView,
} from "@/lib/operations-offline-client";
import {
  createVenueOrder,
  fetchOrderingCatalog,
  type OrderingCatalog,
} from "@/lib/ordering-offline-client";

const TABS = ["Floor", "Visits", "Waitlist", "Reservations", "Orders", "Handover", "Activity", "Policy"] as const;
type Tab = (typeof TABS)[number];
type Activity = { id: string; resourceId: string; fromState?: string | null; toState: string; reason?: string | null; createdAt: string };
type WaitlistEntry = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  partySize: number;
  status: string;
  note?: string | null;
  desiredDurationMinutes: number;
  operations: {
    version: number;
    requestedResourceType?: string | null;
    estimatedWaitMinutes?: number | null;
    notifiedAt?: string | null;
  } | null;
};
type Handover = {
  generatedAt: string;
  activeSessions: Array<{ id: string; resourceId: string; startedAt: string }>;
  pausedSessions: Array<{ id: string; resourceId: string; pausedAt?: string | null }>;
  openChecks: Array<{ id: string; guestName?: string | null; partySize: number; openedAt: string }>;
  pendingOrders: Array<{ id: string; status: string; totalMinor: number; currency: string }>;
  upcomingReservations: Array<{ id: string; guestName?: string | null; startsAt: string; endsAt: string }>;
  unresolvedPayments: Array<{ id: string; state: string; amount: string | number; currency: string; provider: string; reconciliationRequired: boolean }>;
  deviceProblems: Array<{ id: string; label: string; type: string; problem: string }>;
  openCashSessions: Array<{ id: string; drawerId: string; openedAt: string; currency: string }>;
  unresolvedFiscalDocuments: Array<{ id: string; kind: string; state: string; documentNumber?: string | null }>;
};
type Policy = {
  id: string | null;
  version: number;
  pauseBillingMode: "STOP_CHARGING" | "CONTINUE_CHARGING";
  managerOnlyPause: boolean;
  maxPauseMinutes?: number | null;
  moveRatePolicy: "KEEP_SESSION_RATE" | "REPRICE_TARGET";
  fixedSessionAutoExtend: boolean;
  fixedSessionWarningMinutes: number[];
  defaultExtensionMinutes: number;
};

function formatDuration(totalSeconds: number | null | undefined) {
  if (totalSeconds == null) return "—";
  const negative = totalSeconds < 0;
  const seconds = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${negative ? "−" : ""}${hours > 0 ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function projectedTimer(session: OperationsSessionView, generatedAt: string, nowMs: number) {
  const timer = session.timer;
  if (!timer) return { elapsed: null as number | null, remaining: null as number | null };
  const delta = Math.max(0, Math.floor((nowMs - new Date(generatedAt).getTime()) / 1000));
  const frozen = session.status === "PAUSED" && session.pauseBillingMode === "STOP_CHARGING";
  return {
    elapsed: timer.elapsedSeconds + (frozen ? 0 : delta),
    remaining: timer.remainingSeconds == null ? null : timer.remainingSeconds - (frozen ? 0 : delta),
  };
}

function money(minor: number | undefined, currency: string | undefined) {
  return `${((minor ?? 0) / 100).toFixed(2)} ${currency ?? ""}`.trim();
}

export default function OperationsPage() {
  const [tab, setTab] = useState<Tab>("Floor");
  const [floor, setFloor] = useState<OperationsFloorView>({ generatedAt: new Date().toISOString(), resources: [] });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [catalog, setCatalog] = useState<OrderingCatalog | null>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [seatTargets, setSeatTargets] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const [participantCount, setParticipantCount] = useState(1);
  const [sessionNotes, setSessionNotes] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [waitName, setWaitName] = useState("");
  const [waitPhone, setWaitPhone] = useState("");
  const [waitParty, setWaitParty] = useState(2);
  const [waitDuration, setWaitDuration] = useState(60);
  const [waitType, setWaitType] = useState("");
  const [waitNotes, setWaitNotes] = useState("");

  const online = typeof navigator === "undefined" || navigator.onLine;

  const refresh = useCallback(async () => {
    try {
      const nextFloor = await fetchOperationsFloor();
      setFloor(nextFloor);
      if (typeof navigator === "undefined" || navigator.onLine) {
        const [nextActivity, nextWaitlist] = await Promise.all([
          api<Activity[]>("/operations/activity").catch(() => []),
          api<WaitlistEntry[]>("/operations/waitlist").catch(() => []),
        ]);
        setActivity(nextActivity);
        setWaitlist(nextWaitlist);
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Operations.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    void fetchOrderingCatalog()
      .then((next) => {
        setCatalog(next);
        setSelectedItemId((current) => current || next.items[0]?.id || "");
      })
      .catch(() => undefined);
    const refreshTimer = window.setInterval(() => void refresh(), 5000);
    const clockTimer = window.setInterval(() => setNowMs(Date.now()), 1000);
    const reconnect = () => void refresh();
    window.addEventListener("online", reconnect);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("online", reconnect);
    };
  }, [refresh]);

  useEffect(() => {
    if (!online || tab !== "Handover") return;
    void api<Handover>("/operations/handover").then(setHandover).catch((e) => setError(e instanceof Error ? e.message : "Could not load handover."));
  }, [online, tab, floor.generatedAt]);

  useEffect(() => {
    if (!online || tab !== "Policy") return;
    void api<Policy>("/operations/policy").then(setPolicy).catch((e) => setError(e instanceof Error ? e.message : "Could not load operations policy."));
  }, [online, tab]);

  const available = useMemo(() => floor.resources.filter((row) => row.state === "AVAILABLE"), [floor.resources]);
  const resourceTypes = useMemo(() => [...new Set(floor.resources.map((row) => row.type))].sort(), [floor.resources]);
  const simpleItems = useMemo(() => {
    if (!catalog) return [];
    const requiredGroupIds = new Set(catalog.groups.filter((group) => group.required || group.minSelect > 0).map((group) => group.id));
    const blockedItemIds = new Set(catalog.links.filter((link) => requiredGroupIds.has(link.modifierGroupId)).map((link) => link.menuItemId));
    return catalog.items.filter((item) => !blockedItemIds.has(item.id));
  }, [catalog]);
  useEffect(() => {
    if (simpleItems.length && !simpleItems.some((item) => item.id === selectedItemId)) setSelectedItemId(simpleItems[0].id);
  }, [simpleItems, selectedItemId]);

  const sectionAvailability = useMemo(() => {
    const groups = new Map<string, { name: string; available: number; total: number }>();
    for (const resource of floor.resources) {
      const key = resource.sectionName ?? "Unsectioned";
      const row = groups.get(key) ?? { name: key, available: 0, total: 0 };
      row.total += 1;
      if (resource.state === "AVAILABLE") row.available += 1;
      groups.set(key, row);
    }
    return [...groups.values()];
  }, [floor.resources]);

  async function command(key: string, path: string, body?: unknown, method = "POST") {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("This action is online-only in Offline Lite. Session start/end and simple order additions remain locally queueable.");
      return;
    }
    const session = floor.resources.find((row) => row.id === key)?.session;
    const payload = path.includes("/operations/sessions/") && session
      ? { ...(body && typeof body === "object" ? body : {}), expectedVersion: session.version }
      : body;
    setBusy(key);
    setError("");
    try {
      await api(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function startSession(resourceId: string) {
    setBusy(resourceId);
    setError("");
    try {
      await startOperationsSession({
        resourceId,
        participantCount,
        ...(sessionNotes.trim() ? { notes: sessionNotes.trim() } : {}),
        ...(customerId.trim() ? { customerId: customerId.trim() } : {}),
        ...(membershipId.trim() ? { membershipId: membershipId.trim() } : {}),
        ...(packageId.trim() ? { packageId: packageId.trim() } : {}),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Session start failed.");
    } finally {
      setBusy(null);
    }
  }

  async function finishSession(resourceId: string, sessionId: string) {
    setBusy(resourceId);
    setError("");
    try {
      const version = floor.resources.find((row) => row.id === resourceId)?.session?.version;
      if (!version) throw new Error("Session changed; refresh the floor and retry.");
      await finishOperationsSession(sessionId, version);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Session finish failed.");
    } finally {
      setBusy(null);
    }
  }

  async function addSimpleOrder(resourceId: string, sessionId: string, guestCheckId?: string | null) {
    if (!selectedItemId) {
      setError("No offline-safe simple menu item is available. Items requiring modifiers must be entered while online.");
      return;
    }
    setBusy(`order:${resourceId}`);
    setError("");
    try {
      await createVenueOrder({
        serviceMode: "PLAY_SESSION",
        operationsSessionId: sessionId,
        resourceId,
        ...(guestCheckId ? { guestCheckId } : {}),
        lines: [{ menuItemId: selectedItemId, quantity: 1 }],
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order creation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function startGroup() {
    if (groupSelection.length < 2) return;
    if (!online) {
      setError("Grouped session creation is online-only in Offline Lite.");
      return;
    }
    setBusy("group");
    setError("");
    try {
      const group = await api<{ id: string }>("/operations/session-groups", {
        method: "POST",
        body: JSON.stringify({ name: `Group ${new Date().toLocaleTimeString()}` }),
      });
      for (const resourceId of groupSelection) {
        await api("/operations/sessions/start", {
          method: "POST",
          body: JSON.stringify({ resourceId, groupId: group.id, participantCount }),
        });
      }
      setGroupSelection([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Group start failed. Any sessions already started remain attached to the same group.");
    } finally {
      setBusy(null);
    }
  }

  async function pauseSession(resourceId: string, sessionId: string) {
    const reason = window.prompt("Pause reason (required):", "Guest break")?.trim();
    if (!reason) return;
    await command(resourceId, `/operations/sessions/${sessionId}/pause`, { reason });
  }

  async function cancelSession(resourceId: string, sessionId: string) {
    const reason = window.prompt("Cancellation reason (required):")?.trim();
    if (!reason) return;
    await command(resourceId, `/operations/sessions/${sessionId}/cancel`, { reason });
  }

  async function startMaintenance(resourceId: string) {
    const reason = window.prompt("Maintenance reason (required):")?.trim();
    if (!reason) return;
    const expectedReturnAt = window.prompt("Expected return (optional ISO/local date-time):")?.trim();
    const notes = window.prompt("Maintenance notes (optional):")?.trim();
    await command(resourceId, "/operations/maintenance", {
      resourceId,
      reason,
      ...(expectedReturnAt ? { expectedReturnAt: new Date(expectedReturnAt).toISOString() } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  async function createWaitlist() {
    if (!waitName.trim()) {
      setError("Waitlist name is required.");
      return;
    }
    setBusy("waitlist-new");
    try {
      await api("/operations/waitlist", {
        method: "POST",
        body: JSON.stringify({
          name: waitName.trim(),
          ...(waitPhone.trim() ? { phone: waitPhone.trim() } : {}),
          partySize: waitParty,
          desiredDurationMinutes: waitDuration,
          ...(waitType.trim() ? { requestedResourceType: waitType.trim() } : {}),
          ...(waitNotes.trim() ? { notes: waitNotes.trim() } : {}),
        }),
      });
      setWaitName("");
      setWaitPhone("");
      setWaitNotes("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add waitlist entry.");
    } finally {
      setBusy(null);
    }
  }

  async function waitlistAction(entry: WaitlistEntry, action: "notify" | "skip" | "cancel" | "expire") {
    if (!entry.operations) return;
    setBusy(`wait:${entry.id}`);
    try {
      await api(`/operations/waitlist/${entry.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: entry.operations.version }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Waitlist action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function seatWaitlist(entry: WaitlistEntry) {
    if (!entry.operations) return;
    const target = seatTargets[entry.id] || available[0]?.id;
    if (!target) {
      setError("No available resource is selected for seating.");
      return;
    }
    setBusy(`wait:${entry.id}`);
    try {
      await api(`/operations/waitlist/${entry.id}/seat`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: entry.operations.version, resourceId: target }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Waitlist seating failed.");
    } finally {
      setBusy(null);
    }
  }

  async function savePolicy() {
    if (!policy) return;
    setBusy("policy");
    try {
      const updated = await api<Policy>("/operations/policy", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: policy.version,
          pauseBillingMode: policy.pauseBillingMode,
          managerOnlyPause: policy.managerOnlyPause,
          maxPauseMinutes: policy.maxPauseMinutes ?? null,
          moveRatePolicy: policy.moveRatePolicy,
          fixedSessionAutoExtend: policy.fixedSessionAutoExtend,
          fixedSessionWarningMinutes: policy.fixedSessionWarningMinutes,
          defaultExtensionMinutes: policy.defaultExtensionMinutes,
        }),
      });
      setPolicy(updated);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save operations policy.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <TenantPage title="Operations" description="Run sessions, timers, moves, waitlist, orders, maintenance and shift handover from the canonical live floor.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Operations workspace">
          {TABS.map((name) => (
            <button key={name} onClick={() => setTab(name)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${tab === name ? "bg-emerald-400 text-zinc-950" : "border border-zinc-700 bg-zinc-900 text-zinc-200"}`}>
              {name}
            </button>
          ))}
        </div>
        {!online ? <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">Offline Lite: cached floor, session start/end and simple order additions remain queueable. Pause, move, waitlist, maintenance, handover and policy are online-only.</div> : null}
        {error ? <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

        {tab === "Floor" ? (
          <>
            <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 md:grid-cols-3 xl:grid-cols-6">
              <label className="text-xs text-zinc-400">Players<input aria-label="Players" type="number" min={1} max={100} value={participantCount} onChange={(e) => setParticipantCount(Math.max(1, Number(e.target.value) || 1))} className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100" /></label>
              <label className="text-xs text-zinc-400 md:col-span-2">Session notes<input value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder="Optional" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100" /></label>
              <label className="text-xs text-zinc-400">Customer ID<input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Optional" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100" /></label>
              <label className="text-xs text-zinc-400">Membership ID<input value={membershipId} onChange={(e) => setMembershipId(e.target.value)} placeholder="Optional" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100" /></label>
              <label className="text-xs text-zinc-400">Package ID<input value={packageId} onChange={(e) => setPackageId(e.target.value)} placeholder="Optional" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100" /></label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sectionAvailability.map((section) => <span key={section.name} className="rounded-full border border-zinc-700 px-3 py-2 text-xs text-zinc-300">{section.name}: <strong>{section.available}/{section.total}</strong> available</span>)}
              {groupSelection.length >= 2 ? <button disabled={busy !== null} onClick={() => void startGroup()} className="min-h-10 rounded-lg bg-violet-400 px-4 text-sm font-semibold text-zinc-950">Start group ({groupSelection.length})</button> : null}
            </div>
          </>
        ) : null}

        {tab === "Orders" ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">Quick item<select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3">{simpleItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="text-xs text-zinc-500">Mandatory-modifier items remain online-only; server pricing remains authoritative.</span></label>
          </div>
        ) : null}

        {tab === "Floor" || tab === "Visits" || tab === "Orders" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {floor.resources.filter((resource) => tab !== "Visits" || Boolean(resource.session)).map((resource) => {
              const session = resource.session;
              const groupChecked = groupSelection.includes(resource.id);
              const timer = session ? projectedTimer(session, floor.generatedAt, nowMs) : null;
              const moveTarget = session ? moveTargets[session.id] || available.find((row) => row.id !== resource.id)?.id || "" : "";
              return (
                <article key={resource.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-100">{resource.name}</h2><p className="text-xs text-zinc-500">{resource.categoryName ?? resource.type}{resource.sectionName ? ` · ${resource.sectionName}` : ""}{resource.code ? ` · ${resource.code}` : ""}</p></div><span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">{resource.state}</span></div>
                  {session ? (
                    <div className="mt-3 space-y-2 rounded-lg bg-zinc-900 p-3 text-sm">
                      <div className="flex justify-between gap-3"><span>{session.status} · {session.participantCount ?? 1} player(s)</span><strong>{money(session.liveAccruedMinor, session.currency)}</strong></div>
                      <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded bg-zinc-950 p-2"><span className="text-zinc-500">Elapsed</span><strong className="block text-base text-zinc-100">{formatDuration(timer?.elapsed)}</strong></div><div className="rounded bg-zinc-950 p-2"><span className="text-zinc-500">Remaining</span><strong className="block text-base text-zinc-100">{formatDuration(timer?.remaining)}</strong></div></div>
                      <p className="text-xs text-zinc-500">Started {new Date(session.startedAt).toLocaleTimeString()} · pause {session.pauseBillingMode === "CONTINUE_CHARGING" ? "charges" : "stops charge"} · move {session.moveRatePolicy === "REPRICE_TARGET" ? "reprices target" : "keeps rate"}</p>
                      {session.customer ? <p className="text-xs text-zinc-300">Customer: {session.customer.name ?? session.customer.email ?? session.customer.phone ?? session.customer.id}</p> : null}
                      {session.membership ? <p className="text-xs text-violet-200">Membership: {session.membership.tierId} · {session.membership.status}</p> : null}
                      {session.guestCheckId ? <p className="text-xs text-zinc-400">Check {session.guestCheckId.slice(-6)}</p> : null}
                      {(session.openOrderCount ?? 0) > 0 ? <p className="text-xs text-fuchsia-200">Open orders: {session.openOrderCount} · {money(session.openOrderAmountMinor, session.currency)}</p> : null}
                      {session.openCheckAmountDueMinor != null ? <p className="text-xs text-emerald-200">Check due: {money(session.openCheckAmountDueMinor, session.openCheckCurrency ?? session.currency)}</p> : null}
                      {(session.alerts ?? session.timer?.alerts ?? []).length ? <div className="flex flex-wrap gap-1">{(session.alerts ?? session.timer?.alerts ?? []).map((alert) => <span key={alert} className="rounded bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-200">{alert.replaceAll("_", " ")}</span>)}</div> : null}
                    </div>
                  ) : null}
                  {resource.nextReservation ? <p className="mt-3 text-xs text-amber-200">Reservation: {resource.nextReservation.guestName ?? "Guest"} · {new Date(resource.nextReservation.startsAt).toLocaleTimeString()}–{new Date(resource.nextReservation.endsAt).toLocaleTimeString()}</p> : null}
                  {resource.maintenance ? <p className="mt-3 text-xs text-orange-200">Maintenance: {resource.maintenance.reason}{resource.maintenance.expectedReturnAt ? ` · ETA ${new Date(resource.maintenance.expectedReturnAt).toLocaleString()}` : ""}{resource.maintenance.notes ? ` · ${resource.maintenance.notes}` : ""}</p> : null}
                  {tab === "Floor" && !session && resource.state === "AVAILABLE" ? <label className="mt-3 flex min-h-10 items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={groupChecked} onChange={(e) => setGroupSelection((ids) => e.target.checked ? [...ids, resource.id] : ids.filter((id) => id !== resource.id))} /> Select for grouped session</label> : null}
                  {session && available.length ? <label className="mt-3 block text-xs text-zinc-400">Move target<select value={moveTarget} onChange={(e) => setMoveTargets((current) => ({ ...current, [session.id]: e.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-zinc-100"><option value="">Select resource</option>{available.filter((row) => row.id !== resource.id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label> : null}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {!session && resource.state === "AVAILABLE" ? <button disabled={busy !== null} onClick={() => void startSession(resource.id)} className="min-h-11 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-zinc-950">Start</button> : null}
                    {session?.status === "ACTIVE" ? <button disabled={busy !== null} onClick={() => void pauseSession(resource.id, session.id)} className="min-h-11 rounded-lg bg-amber-400 px-3 text-sm font-semibold text-zinc-950">Pause</button> : null}
                    {session?.status === "PAUSED" ? <button disabled={busy !== null} onClick={() => void command(resource.id, `/operations/sessions/${session.id}/resume`)} className="min-h-11 rounded-lg bg-sky-400 px-3 text-sm font-semibold text-zinc-950">Resume</button> : null}
                    {session && moveTarget ? <button disabled={busy !== null} onClick={() => void command(resource.id, `/operations/sessions/${session.id}/move`, { resourceId: moveTarget })} className="min-h-11 rounded-lg border border-zinc-600 px-3 text-sm font-semibold text-zinc-100">Move</button> : null}
                    {session?.billingMode === "FIXED_DURATION" ? <button disabled={busy !== null} onClick={() => void command(resource.id, `/operations/sessions/${session.id}/extend`, { minutes: session.extensionMinutes ?? 15 })} className="min-h-11 rounded-lg border border-violet-500/60 px-3 text-sm font-semibold text-violet-200">+{session.extensionMinutes ?? 15} min</button> : null}
                    {session ? <button disabled={busy !== null} onClick={() => void finishSession(resource.id, session.id)} className="min-h-11 rounded-lg border border-red-500/50 px-3 text-sm font-semibold text-red-200">End</button> : null}
                    {session ? <button disabled={busy !== null} onClick={() => void cancelSession(resource.id, session.id)} className="min-h-11 rounded-lg border border-red-800 px-3 text-sm text-red-300">Cancel</button> : null}
                    {tab === "Orders" && session ? <button disabled={busy !== null || !selectedItemId} onClick={() => void addSimpleOrder(resource.id, session.id, session.guestCheckId)} className="min-h-11 rounded-lg bg-fuchsia-400 px-3 text-sm font-semibold text-zinc-950">Add item</button> : null}
                    {!session && !resource.maintenance && resource.state === "AVAILABLE" ? <button disabled={busy !== null} onClick={() => void startMaintenance(resource.id)} className="min-h-11 rounded-lg border border-orange-500/50 px-3 text-sm text-orange-200">Maintenance</button> : null}
                    {resource.maintenance ? <button disabled={busy !== null} onClick={() => void command(resource.id, `/operations/maintenance/${resource.maintenance?.id}`, undefined, "DELETE")} className="min-h-11 rounded-lg border border-emerald-500/50 px-3 text-sm text-emerald-200">Return to service</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {tab === "Waitlist" ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 md:grid-cols-3 xl:grid-cols-6">
              <input value={waitName} onChange={(e) => setWaitName(e.target.value)} placeholder="Name *" className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3" />
              <input value={waitPhone} onChange={(e) => setWaitPhone(e.target.value)} placeholder="Phone" className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3" />
              <label className="text-xs text-zinc-400">Party<input type="number" min={1} max={100} value={waitParty} onChange={(e) => setWaitParty(Math.max(1, Number(e.target.value) || 1))} className="mt-1 min-h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3" /></label>
              <label className="text-xs text-zinc-400">Minutes<input type="number" min={1} max={1440} value={waitDuration} onChange={(e) => setWaitDuration(Math.max(1, Number(e.target.value) || 1))} className="mt-1 min-h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3" /></label>
              <select value={waitType} onChange={(e) => setWaitType(e.target.value)} className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3"><option value="">Any resource type</option>{resourceTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
              <button disabled={busy !== null || !online} onClick={() => void createWaitlist()} className="min-h-11 rounded-lg bg-emerald-400 px-3 font-semibold text-zinc-950">Add to waitlist</button>
              <input value={waitNotes} onChange={(e) => setWaitNotes(e.target.value)} placeholder="Notes" className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3 md:col-span-3 xl:col-span-6" />
            </div>
            {waitlist.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{entry.guestName} · party {entry.partySize}</h2><p className="text-xs text-zinc-400">{entry.guestPhone ?? "No phone"} · wants {entry.desiredDurationMinutes} min · {entry.operations?.requestedResourceType ?? "any resource"} · est. {entry.operations?.estimatedWaitMinutes ?? 0} min</p>{entry.note ? <p className="mt-1 text-xs text-zinc-500">{entry.note}</p> : null}</div><span className="rounded border border-zinc-700 px-2 py-1 text-xs">{entry.status}</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select value={seatTargets[entry.id] || available[0]?.id || ""} onChange={(e) => setSeatTargets((current) => ({ ...current, [entry.id]: e.target.value }))} className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm"><option value="">Seat resource</option>{available.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select>
                  <button disabled={busy !== null || !available.length} onClick={() => void seatWaitlist(entry)} className="min-h-10 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-zinc-950">Seat / Start</button>
                  <button disabled={busy !== null} onClick={() => void waitlistAction(entry, "notify")} className="min-h-10 rounded-lg border border-sky-500/50 px-3 text-sm text-sky-200">Notify</button>
                  <button disabled={busy !== null} onClick={() => void waitlistAction(entry, "skip")} className="min-h-10 rounded-lg border border-amber-500/50 px-3 text-sm text-amber-200">Skip</button>
                  <button disabled={busy !== null} onClick={() => void waitlistAction(entry, "cancel")} className="min-h-10 rounded-lg border border-red-500/50 px-3 text-sm text-red-200">Cancel</button>
                  <button disabled={busy !== null} onClick={() => void waitlistAction(entry, "expire")} className="min-h-10 rounded-lg border border-zinc-600 px-3 text-sm text-zinc-300">Expire</button>
                </div>
              </article>
            ))}
            {!waitlist.length ? <p className="text-sm text-zinc-500">No active waitlist entries.</p> : null}
          </div>
        ) : null}

        {tab === "Reservations" ? <div className="space-y-2">{floor.resources.filter((resource) => resource.nextReservation).map((resource) => <div key={resource.id} className="rounded-lg border border-zinc-800 p-3 text-sm"><strong>{resource.name}</strong><span className="ml-3 text-zinc-400">{resource.nextReservation?.guestName ?? "Guest"} · {new Date(resource.nextReservation!.startsAt).toLocaleString()} – {new Date(resource.nextReservation!.endsAt).toLocaleTimeString()}</span></div>)}</div> : null}

        {tab === "Handover" ? (
          handover ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {([
              ["Active sessions", handover.activeSessions],
              ["Paused sessions", handover.pausedSessions],
              ["Open checks", handover.openChecks],
              ["Pending orders", handover.pendingOrders],
              ["Upcoming reservations", handover.upcomingReservations],
              ["Unresolved payments", handover.unresolvedPayments],
              ["Device problems", handover.deviceProblems],
              ["Open cash sessions", handover.openCashSessions],
              ["Cash / fiscal issues", handover.unresolvedFiscalDocuments],
            ] as Array<[string, Array<Record<string, unknown>>]>).map(([title, rows]) => <section key={title} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"><h2 className="font-semibold">{title} <span className="text-zinc-500">({rows.length})</span></h2><div className="mt-2 space-y-2">{rows.map((row, index) => <pre key={String(row.id ?? index)} className="overflow-x-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 text-[11px] text-zinc-300">{JSON.stringify(row, null, 2)}</pre>)}</div></section>)}
          </div> : <p className="text-sm text-zinc-500">Loading shift handover…</p>
        ) : null}

        {tab === "Activity" ? <div className="space-y-2">{activity.map((event) => <div key={event.id} className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300"><span className="font-medium">{event.fromState ?? "—"} → {event.toState}</span><span className="ml-2 text-zinc-500">{event.reason ?? ""} · {new Date(event.createdAt).toLocaleString()}</span></div>)}</div> : null}

        {tab === "Policy" ? (
          policy ? <div className="max-w-3xl space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-sm text-zinc-400">Policy is snapshotted when each session starts. Later changes never rewrite a running session’s history.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Pause billing<select value={policy.pauseBillingMode} onChange={(e) => setPolicy({ ...policy, pauseBillingMode: e.target.value as Policy["pauseBillingMode"] })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3"><option value="STOP_CHARGING">Stop charging</option><option value="CONTINUE_CHARGING">Continue charging</option></select></label>
              <label className="text-sm">Move pricing<select value={policy.moveRatePolicy} onChange={(e) => setPolicy({ ...policy, moveRatePolicy: e.target.value as Policy["moveRatePolicy"] })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3"><option value="KEEP_SESSION_RATE">Keep session rate</option><option value="REPRICE_TARGET">Reprice target resource</option></select></label>
              <label className="text-sm">Max pause minutes<input type="number" min={1} value={policy.maxPauseMinutes ?? ""} onChange={(e) => setPolicy({ ...policy, maxPauseMinutes: e.target.value ? Number(e.target.value) : null })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3" /></label>
              <label className="text-sm">Default extension minutes<input type="number" min={1} value={policy.defaultExtensionMinutes} onChange={(e) => setPolicy({ ...policy, defaultExtensionMinutes: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3" /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={policy.managerOnlyPause} onChange={(e) => setPolicy({ ...policy, managerOnlyPause: e.target.checked })} /> Manager-only pause</label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={policy.fixedSessionAutoExtend} onChange={(e) => setPolicy({ ...policy, fixedSessionAutoExtend: e.target.checked })} /> Auto-extend fixed sessions</label>
              <label className="text-sm md:col-span-2">Warning thresholds (minutes, comma-separated)<input value={policy.fixedSessionWarningMinutes.join(",")} onChange={(e) => setPolicy({ ...policy, fixedSessionWarningMinutes: e.target.value.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0) })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3" /></label>
            </div>
            <button disabled={busy !== null} onClick={() => void savePolicy()} className="min-h-11 rounded-lg bg-emerald-400 px-4 font-semibold text-zinc-950">Save policy</button>
          </div> : <p className="text-sm text-zinc-500">Loading policy…</p>
        ) : null}
      </div>
    </TenantPage>
  );
}
