import { api } from "./api";

export type DeviceType =
  | "POS"
  | "PAYMENT_TERMINAL"
  | "EDGE_HUB"
  | "PRINTER"
  | "KDS";

export type DeviceStatus = "ACTIVE" | "DISABLED";

export type VenueDevice = {
  id: string;
  label: string;
  type: DeviceType;
  provider: string | null;
  status: DeviceStatus;
  online: boolean;
  lastSeenAt: string | null;
  metadata: Record<string, unknown> | null;
  terminal: null | {
    id: string;
    provider: string;
    externalTerminalId: string | null;
    capabilities: Record<string, unknown> | null;
    enabled: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export function fetchDevices() {
  return api<{ devices: VenueDevice[] }>("/devices");
}

export function createDevice(body: {
  label: string;
  type: DeviceType;
  provider?: string;
  externalTerminalId?: string;
}) {
  return api<VenueDevice>("/devices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateDevice(
  id: string,
  body: Partial<{
    label: string;
    status: DeviceStatus;
    provider: string;
    externalTerminalId: string;
    terminalEnabled: boolean;
  }>,
) {
  return api<VenueDevice>(`/devices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function heartbeatDevice(id: string) {
  return api<VenueDevice>(`/devices/${id}/heartbeat`, { method: "POST" });
}
