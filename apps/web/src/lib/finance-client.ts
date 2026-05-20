import { api } from "./api";

export type TransactionLine = {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Transaction = {
  id: string;
  kind: string;
  method: string;
  amount: number;
  note: string | null;
  createdAt: string;
  lines: TransactionLine[];
};

export type ShopLoss = {
  id: string;
  amount: number;
  reason: string;
  category: string | null;
  occurredAt: string;
  createdAt: string;
};

export type SalesByItem = {
  menuItemId: string | null;
  name: string;
  quantity: number;
  revenue: number;
};

export type ShopOrderLine = {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineStatus: "ACTIVE" | "CANCELED";
  createdAt?: string;
};

export type ShopOrder = {
  id: string;
  status: "PENDING" | "COMPLETED" | "CANCELED";
  label: string | null;
  note: string | null;
  paymentMethod: string;
  total: number;
  guestCount: number;
  tableReserved: boolean;
  reservationFee: number | null;
  createdAt: string;
  updatedAt?: string;
  completedAt: string | null;
  canceledAt: string | null;
  archivedAt: string | null;
  lines: ShopOrderLine[];
};

export type FinanceAnalytics = {
  days: number;
  summary: {
    revenue: number;
    revenueMenuOrders: number;
    revenueQuickSales: number;
    revenueReservations: number;
    revenuePlaySessions: number;
    revenueTransactions: number;
    revenueOrders: number;
    losses: number;
    profit: number;
    orderCount: number;
    completedOrderCount: number;
    customerCount: number;
    menuCovers: number;
    reservationGuests: number;
    playPlayers: number;
    marketingViews: number;
    menuViews: number;
    reservationClicks: number;
    transactionCount: number;
    playSessionCount: number;
  };
  revenueByDay: {
    day: string;
    menuOrders: number;
    reservations: number;
    playSessions: number;
    quickSales: number;
    total: number;
  }[];
  lossesByDay: { day: string; amount: number }[];
  ordersByDay: {
    day: string;
    count: number;
    customers: number;
    completed: number;
  }[];
  audienceByDay: {
    day: string;
    menuCovers: number;
    reservationGuests: number;
    playPlayers: number;
    marketingViews: number;
  }[];
  topItems: SalesByItem[];
};

export type PlaySession = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELED";
  resourceId: string | null;
  resource?: { id: string; name: string; type: string } | null;
  reservation?: {
    id: string;
    guestName: string;
    partySize: number;
    startsAt: string;
  } | null;
  playerCount: number;
  durationMinutes: number | null;
  amount: number;
  paymentMethod: string;
  label: string | null;
  note: string | null;
  startedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
};

export type ListOrdersParams = {
  status?: "PENDING" | "COMPLETED" | "CANCELED" | "ALL";
  archived?: "exclude" | "only" | "all";
  from?: string;
  to?: string;
  q?: string;
  take?: number;
};

export function fetchShopOrders(params: ListOrdersParams = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.archived) q.set("archived", params.archived);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.q) q.set("q", params.q);
  q.set("take", String(params.take ?? 80));
  return api<ShopOrder[]>(`/finance/orders?${q.toString()}`);
}

export function fetchShopOrder(id: string) {
  return api<ShopOrder>(`/finance/orders/${id}`);
}

export function orderLinesSubtotal(order: ShopOrder): number {
  return order.lines
    .filter((l) => l.lineStatus === "ACTIVE")
    .reduce((s, l) => s + l.quantity * l.unitPrice, 0);
}

export function createShopOrder(body?: {
  label?: string;
  note?: string;
  paymentMethod?: string;
  guestCount?: number;
  tableReserved?: boolean;
  reservationFee?: number | null;
}) {
  return api<ShopOrder>("/finance/orders", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function updateShopOrder(
  id: string,
  body: {
    status?: "PENDING" | "COMPLETED" | "CANCELED";
    label?: string | null;
    note?: string | null;
    paymentMethod?: string;
    guestCount?: number;
    tableReserved?: boolean;
    reservationFee?: number | null;
  },
) {
  return api<ShopOrder>(`/finance/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function archiveShopOrders(ids: string[]) {
  return api<{ updated: number }>("/finance/orders/bulk/archive", {
    method: "PATCH",
    body: JSON.stringify({ ids }),
  });
}

export function unarchiveShopOrders(ids: string[]) {
  return api<{ updated: number }>("/finance/orders/bulk/unarchive", {
    method: "PATCH",
    body: JSON.stringify({ ids }),
  });
}

export function fetchTopSellers(days = 30, limit = 10) {
  return api<SalesByItem[]>(
    `/finance/orders/top-sellers?days=${days}&limit=${limit}`,
  );
}

export function fetchFinanceAnalytics(days = 30) {
  return api<FinanceAnalytics>(`/finance/analytics?days=${days}`);
}

export function addShopOrderLine(
  orderId: string,
  body: { menuItemId: string; quantity?: number },
) {
  return api<ShopOrder>(`/finance/orders/${orderId}/lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchShopOrderLine(
  orderId: string,
  lineId: string,
  body: {
    quantity?: number;
    unitPrice?: number;
    lineStatus?: "ACTIVE" | "CANCELED";
  },
) {
  return api<ShopOrder>(
    `/finance/orders/${orderId}/lines/${lineId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function deleteShopOrderLine(orderId: string, lineId: string) {
  return api<ShopOrder>(`/finance/orders/${orderId}/lines/${lineId}`, {
    method: "DELETE",
  });
}

export function deleteShopOrder(id: string) {
  return api<{ ok: boolean }>(`/finance/orders/${id}`, { method: "DELETE" });
}

export function fetchTransactions(take = 40) {
  return api<Transaction[]>(`/finance/transactions?take=${take}`);
}

export function createTransaction(body: {
  kind: "SALE" | "REFUND";
  method?: string;
  note?: string;
  lines: {
    menuItemId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
}) {
  return api<Transaction>("/finance/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchSalesByItem(days = 30) {
  return api<SalesByItem[]>(`/finance/sales-by-item?days=${days}`);
}

export function fetchLosses() {
  return api<ShopLoss[]>("/finance/losses");
}

export function createLoss(body: {
  amount: number;
  reason: string;
  category?: string;
  occurredAt?: string;
}) {
  return api<ShopLoss>("/finance/losses", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteLoss(id: string) {
  return api(`/finance/losses/${id}`, { method: "DELETE" });
}

export function fetchPlaySessions(params?: {
  status?: "ACTIVE" | "COMPLETED" | "CANCELED" | "ALL";
  archived?: "exclude" | "only";
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.archived) q.set("archived", params.archived);
  return api<PlaySession[]>(`/finance/play-sessions?${q.toString()}`);
}

export function createPlaySession(body: {
  resourceId?: string;
  playerCount?: number;
  durationMinutes?: number;
  amount?: number;
  paymentMethod?: string;
  label?: string;
  note?: string;
}) {
  return api<PlaySession>("/finance/play-sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePlaySession(
  id: string,
  body: {
    status?: "ACTIVE" | "COMPLETED" | "CANCELED";
    playerCount?: number;
    durationMinutes?: number;
    amount?: number;
    paymentMethod?: string;
    label?: string | null;
    note?: string | null;
  },
) {
  return api<PlaySession>(`/finance/play-sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
