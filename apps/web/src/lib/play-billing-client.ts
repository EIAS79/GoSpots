import { api } from "./api";

export type PlayBillingTab =
  | "in_progress"
  | "awaiting_payment"
  | "paid"
  | "all";

export type GameBillingSource = "booking" | "walk_in";

export type PlayBillingItem = {
  id: string;
  source: GameBillingSource;
  guestName: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: string;
  billedAmount: number | null;
  billedAt: string | null;
  discountPercent: number;
  notes: string | null;
  bucket: PlayBillingTab | null;
  isPaid: boolean;
  resource: {
    id: string;
    name: string;
    type: string;
    categoryName: string | null;
  } | null;
  durationMinutes: number;
  /** Rate-calculated amount from Gaming setup */
  computedAmount: number;
  /** Charge before discount (staff-edited or from rates) */
  baseAmount: number;
  amountDue: number;
  rateLabel: string;
  breakdown: string;
  collectsPartySize?: boolean;
};

export type PlayBillingDayGroup = {
  day: string;
  items: PlayBillingItem[];
  totalDue: number;
  totalPaid: number;
};

export type PlayBillingResponse = {
  items: PlayBillingItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  days: PlayBillingDayGroup[];
  summary: {
    inProgress: number;
    awaitingPayment: number;
    paid: number;
    unpaidTotal: number;
    paidTotal: number;
  };
};

export function fetchPlayBilling(params?: {
  tab?: PlayBillingTab;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.tab) q.set("tab", params.tab);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.pageSize != null) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return api<PlayBillingResponse>(
    `/finance/play-billing${qs ? `?${qs}` : ""}`,
  );
}

export function markPlayBillingPaid(
  reservationId: string,
  body?: {
    amountOverride?: number;
    discountPercent?: number;
    paymentMethod?: string;
  },
) {
  return api<PlayBillingItem>(
    `/finance/play-billing/${reservationId}/mark-paid`,
    {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export function markWalkInPaid(
  sessionId: string,
  body?: { amountOverride?: number; discountPercent?: number },
) {
  return api<PlayBillingItem>(
    `/finance/play-sessions/${sessionId}/mark-paid`,
    {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export function markGameBillingPaid(
  item: Pick<PlayBillingItem, "id" | "source" | "discountPercent" | "amountDue">,
  body?: { amountOverride?: number; discountPercent?: number },
) {
  const payload = {
    discountPercent: body?.discountPercent ?? item.discountPercent,
    amountOverride: body?.amountOverride,
  };
  return item.source === "walk_in"
    ? markWalkInPaid(item.id, payload)
    : markPlayBillingPaid(item.id, payload);
}

export type UpdatePlayBillingBody = {
  guestName?: string;
  resourceId?: string;
  partySize?: number;
  startsAt?: string;
  endsAt?: string;
  notes?: string | null;
  /** Base charge before discount. Null reverts to Gaming setup rates. */
  baseAmount?: number | null;
  discountPercent?: number;
  clearPaid?: boolean;
};

export function updatePlayBilling(
  reservationId: string,
  body: UpdatePlayBillingBody,
) {
  return api<PlayBillingItem>(`/finance/play-billing/${reservationId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type UpdateWalkInBody = {
  resourceId?: string | null;
  playerCount?: number;
  durationMinutes?: number;
  amount?: number;
  discountPercent?: number;
  label?: string | null;
  note?: string | null;
  endSession?: boolean;
  clearPaid?: boolean;
};

export function updateWalkIn(sessionId: string, body: UpdateWalkInBody) {
  return api(`/finance/play-sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function cancelWalkIn(sessionId: string) {
  return api<{ ok: true; sessionId: string }>(
    `/finance/play-sessions/${sessionId}/cancel`,
    { method: "PATCH", body: JSON.stringify({}) },
  );
}

export type PlayBillingCancelReason = "NO_SHOW" | "CANCELED";

export function cancelPlayBilling(
  reservationId: string,
  body?: { reason?: PlayBillingCancelReason },
) {
  return api<{ ok: true; reason: PlayBillingCancelReason; reservationId: string }>(
    `/finance/play-billing/${reservationId}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify(body ?? { reason: "NO_SHOW" }),
    },
  );
}

export type CreateWalkInBody = {
  resourceId?: string;
  playerCount?: number;
  durationMinutes?: number;
  amount?: number;
  discountPercent?: number;
  label?: string;
  note?: string;
};

export function createWalkIn(body: CreateWalkInBody) {
  return api(`/finance/play-sessions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function dateInputDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function defaultPlayBillingRange() {
  return {
    from: dateInputDaysAgo(30),
    to: new Date().toISOString().slice(0, 10),
  };
}

export function applyBillingTotal(
  baseAmount: number,
  discountPercent: number,
): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  return Math.round(baseAmount * (1 - pct / 100) * 100) / 100;
}

/** @deprecated Use applyBillingTotal */
export function applyDiscountPreview(
  baseAmount: number,
  discountPercent: number,
) {
  return applyBillingTotal(baseAmount, discountPercent);
}
