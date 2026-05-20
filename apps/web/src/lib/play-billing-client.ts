import { api } from "./api";

export type PlayBillingTab =
  | "in_progress"
  | "awaiting_payment"
  | "paid"
  | "all";

export type PlayBillingItem = {
  id: string;
  guestName: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: string;
  billedAmount: number | null;
  billedAt: string | null;
  notes: string | null;
  bucket: PlayBillingTab | null;
  isPaid: boolean;
  resource: {
    id: string;
    name: string;
    type: string;
    categoryName: string | null;
  };
  durationMinutes: number;
  computedAmount: number;
  amountDue: number;
  rateLabel: string;
  breakdown: string;
};

export type PlayBillingDayGroup = {
  day: string;
  items: PlayBillingItem[];
  totalDue: number;
  totalPaid: number;
};

export type PlayBillingResponse = {
  items: PlayBillingItem[];
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
}) {
  const q = new URLSearchParams();
  if (params?.tab) q.set("tab", params.tab);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return api<PlayBillingResponse>(
    `/finance/play-billing${qs ? `?${qs}` : ""}`,
  );
}

export function markPlayBillingPaid(
  reservationId: string,
  body?: { amountOverride?: number },
) {
  return api<PlayBillingItem>(
    `/finance/play-billing/${reservationId}/mark-paid`,
    {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export type UpdatePlayBillingBody = {
  guestName?: string;
  resourceId?: string;
  partySize?: number;
  startsAt?: string;
  endsAt?: string;
  notes?: string | null;
  amountOverride?: number | null;
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
