"use client";

import { Loader2, MonitorSmartphone, Plus, Radio, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createDevice,
  fetchDevices,
  heartbeatDevice,
  updateDevice,
  type DeviceType,
  type VenueDevice,
} from "@/lib/device-client";

const TYPES: Array<{ value: DeviceType; label: string }> = [
  { value: "POS", label: "POS" },
  { value: "PAYMENT_TERMINAL", label: "Payment terminal" },
  { value: "EDGE_HUB", label: "Edge hub" },
  { value: "PRINTER", label: "Printer" },
  { value: "KDS", label: "Kitchen display (KDS)" },
];

function lastSeen(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unable to update devices.";
}

export function DeviceSettingsPanel({ canWrite = true }: { canWrite?: boolean }) {
  const [devices, setDevices] = useState<VenueDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<DeviceType>("POS");
  const [provider, setProvider] = useState("");
  const [externalTerminalId, setExternalTerminalId] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDevices();
      setDevices(result.devices);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addDevice() {
    if (!canWrite || creating || !label.trim()) return;
    if (type === "PAYMENT_TERMINAL" && !provider.trim()) {
      setError("A payment terminal needs a provider key. The real provider connector is configured separately.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createDevice({
        label: label.trim(),
        type,
        ...(provider.trim() ? { provider: provider.trim() } : {}),
        ...(type === "PAYMENT_TERMINAL" && externalTerminalId.trim()
          ? { externalTerminalId: externalTerminalId.trim() }
          : {}),
      });
      setLabel("");
      setProvider("");
      setExternalTerminalId("");
      await load();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setCreating(false);
    }
  }

  async function toggle(device: VenueDevice) {
    if (!canWrite || busyId) return;
    setBusyId(device.id);
    setError(null);
    try {
      await updateDevice(device.id, {
        status: device.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
      });
      await load();
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setBusyId(null);
    }
  }

  async function heartbeat(device: VenueDevice) {
    if (!canWrite || busyId || device.status !== "ACTIVE") return;
    setBusyId(device.id);
    setError(null);
    try {
      await heartbeatDevice(device.id);
      await load();
    } catch (heartbeatError) {
      setError(errorMessage(heartbeatError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-400/10 text-sky-300">
            <MonitorSmartphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-white">Devices</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              Register POS stations, payment terminals, edge hubs, printers and KDS devices for this venue. Provider credentials are never stored in this registry.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {canWrite ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-white/8 bg-black/20 p-3 md:grid-cols-[minmax(10rem,1.3fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Device label"
            className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-sky-400/50"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as DeviceType)}
            className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-sky-400/50"
          >
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <input
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            placeholder={type === "PAYMENT_TERMINAL" ? "Provider key (required)" : "Provider (optional)"}
            className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-sky-400/50"
          />
          <input
            value={externalTerminalId}
            disabled={type !== "PAYMENT_TERMINAL"}
            onChange={(event) => setExternalTerminalId(event.target.value)}
            placeholder="External terminal ID"
            className="h-10 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-sky-400/50 disabled:cursor-not-allowed disabled:opacity-35"
          />
          <button
            type="button"
            onClick={() => void addDevice()}
            disabled={creating || !label.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-400 px-3 text-xs font-bold text-sky-950 hover:bg-sky-300 disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-xs leading-5 text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
        <div className="hidden grid-cols-[minmax(11rem,1.3fr)_9rem_minmax(8rem,1fr)_7rem_minmax(10rem,1fr)_auto] gap-3 border-b border-white/8 bg-white/[0.025] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600 md:grid">
          <span>Label</span><span>Type</span><span>Provider</span><span>Online</span><span>Last seen</span><span>Actions</span>
        </div>
        {loading && devices.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
          </div>
        ) : devices.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">No devices registered for this venue.</div>
        ) : (
          devices.map((device) => (
            <div key={device.id} className="grid gap-2 border-b border-white/5 px-3 py-3 last:border-b-0 md:grid-cols-[minmax(11rem,1.3fr)_9rem_minmax(8rem,1fr)_7rem_minmax(10rem,1fr)_auto] md:items-center md:gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">{device.label}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">{device.status === "ACTIVE" ? "Enabled" : "Disabled"}</p>
              </div>
              <span className="text-xs text-zinc-400">{TYPES.find((item) => item.value === device.type)?.label ?? device.type}</span>
              <span className="truncate text-xs text-zinc-400">{device.provider ?? "—"}</span>
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${device.online ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-zinc-500"}`}>
                <Radio className="h-3 w-3" /> {device.online ? "Online" : "Offline"}
              </span>
              <span className="text-xs text-zinc-500">{lastSeen(device.lastSeenAt)}</span>
              <div className="flex flex-wrap gap-1.5">
                {canWrite ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void heartbeat(device)}
                      disabled={Boolean(busyId) || device.status !== "ACTIVE"}
                      className="min-h-8 rounded-lg border border-white/10 px-2 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-35"
                    >
                      Ping
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggle(device)}
                      disabled={Boolean(busyId)}
                      className="min-h-8 rounded-lg border border-white/10 px-2 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-35"
                    >
                      {device.status === "ACTIVE" ? "Disable" : "Enable"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-zinc-600">
        “Online” is derived from a recent heartbeat; a timeout does not alter payment state. Real payment-terminal connectivity is added through provider connectors, not hard-coded into Checkout.
      </p>
    </section>
  );
}
