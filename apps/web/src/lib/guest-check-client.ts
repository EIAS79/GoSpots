import { api } from "./api";

export type GuestCheckStatus = "OPEN" | "SETTLED" | "VOID";

export type GuestCheckTotalLine = {
  kind: "MENU" | "PLAY" | "FEE" | "EXCLUDED_PLAY";
  sourceType: "SHOP_ORDER" | "PLAY_SESSION" | "RESERVATION";
  sourceId: string;
  label: string;
  amount: string;
  excluded: boolean;
  reason?: string;
};

export type GuestCheck = {
  id: string;
  shopId: string;
  status: GuestCheckStatus;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  label: string | null;
  note: string | null;
  currency: string | null;
  paymentMethod: string | null;
  openedAt: string;
  settledAt: string | null;
  voidedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  shopOrders: Array<{
    id: string;
    status: string;
    total: string;
    label: string | null;
    reservationFee: string | null;
    guestCount: number;
    createdAt: string;
    completedAt: string | null;
  }>;
  playSessions: Array<{
    id: string;
    status: string;
    amount: string;
    reservationId: string | null;
    label: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
  reservations: Array<{
    id: string;
    guestName: string;
    billedAmount: string | null;
    billedAt: string | null;
    resourceId: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
  }>;
  runningTotal: string;
  menuTotal: string;
  playTotal: string;
  reservationTotal: string;
  totalLines: GuestCheckTotalLine[];
};

export type GuestCheckListResponse = {
  checks: GuestCheck[];
  canWrite: boolean;
};

export function fetchGuestChecks(status: GuestCheckStatus | "ALL" = "OPEN") {
  const q = status === "OPEN" ? "" : `?status=${status}`;
  return api<GuestCheckListResponse>(`/guest-checks${q}`);
}

export function fetchGuestCheck(id: string) {
  return api<GuestCheck>(`/guest-checks/${id}`);
}

export function createGuestCheck(body: {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize?: number;
  label?: string;
  note?: string;
}) {
  return api<GuestCheck>("/guest-checks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateGuestCheck(
  id: string,
  body: {
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    partySize?: number;
    label?: string;
    note?: string;
  },
) {
  return api<GuestCheck>(`/guest-checks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function voidGuestCheck(id: string) {
  return api<GuestCheck>(`/guest-checks/${id}/void`, { method: "POST" });
}

export function attachToGuestCheck(
  id: string,
  body: {
    shopOrderId?: string;
    playSessionId?: string;
    reservationId?: string;
  },
) {
  return api<GuestCheck>(`/guest-checks/${id}/attach`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function detachFromGuestCheck(
  id: string,
  body: {
    shopOrderId?: string;
    playSessionId?: string;
    reservationId?: string;
  },
) {
  return api<GuestCheck>(`/guest-checks/${id}/detach`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
