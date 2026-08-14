import { api } from "./api";

export type DeviceType =
  | "POS"
  | "PAYMENT_TERMINAL"
  | "EDGE_HUB"
  | "PRINTER"
  | "KDS"
  | "CUSTOMER_DISPLAY"
  | "BARCODE_SCANNER"
  | "RECEIPT_PRINTER"
  | "KITCHEN_PRINTER"
  | "CASH_DRAWER"
  | "ACCESS_SCANNER";

export type DeviceStatus = "ACTIVE" | "DISABLED";

export type VenueDevice = {
  id: string;
  label: string;
  type: DeviceType;
  provider: string | null;
  status: DeviceStatus;
  claimState: "UNCLAIMED" | "CLAIMED";
  stationLabel: string | null;
  softwareVersion: string | null;
  claimedAt: string | null;
  claimedById: string | null;
  version: number;
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
  stationLabel?: string;
  softwareVersion?: string;
}) {
  return api<VenueDevice>("/devices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateDevice(
  id: string,
  body: { expectedVersion: number } & Partial<{
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

export function claimDevice(id: string, expectedVersion: number) {
  return api<VenueDevice>(`/devices/${id}/claim`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function unclaimDevice(id: string, expectedVersion: number) {
  return api<VenueDevice>(`/devices/${id}/unclaim`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function heartbeatDevice(id: string) {
  return api<VenueDevice>(`/devices/${id}/heartbeat`, { method: "POST" });
}
