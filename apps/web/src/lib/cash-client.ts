import { api } from "./api";
import {
  idempotencyActionKey,
  withIdempotentFinanceCall,
} from "./idempotency-key";

export type CashMovementType =
  | "CASH_SALE"
  | "PAY_IN"
  | "PAY_OUT"
  | "CASH_REFUND"
  | "SAFE_DROP";

export type CashMovement = {
  id: string;
  type: CashMovementType;
  amount: string;
  currency: string;
  reasonCategory: string;
  note: string | null;
  actorId: string;
  paymentId: string | null;
  occurredAt: string;
};

export type CashSessionView = {
  id: string;
  status: "OPEN" | "CLOSED";
  drawer: { id: string; name: string };
  openedById: string;
  openedAt: string;
  openingFloat: string;
  currency: string;
  version: number;
  expectedCash: string | null;
  expectedHidden: boolean;
  movementTotals: {
    cashSales: string;
    payIns: string;
    payOuts: string;
    cashRefunds: string;
    safeDrops: string;
  };
  movements: CashMovement[];
  latestCount: null | {
    id: string;
    countedAmount: string;
    expectedCashAtSubmission: string;
    variance: string;
    blindCount: boolean;
    actorId: string;
    submittedAt: string;
    approval: null | {
      id: string;
      status: "PENDING" | "APPROVED";
      approvedById: string | null;
      requestedAt: string;
      decidedAt: string | null;
    };
  };
  closedExpectedCash: string | null;
  countedCash: string | null;
  variance: string | null;
  closedAt: string | null;
  closedById: string | null;
  closeNote: string | null;
};

export type CashPolicy = {
  cashSessionRequired: boolean;
  cashBlindCountEnabled: boolean;
  cashVarianceApprovalThreshold: string;
  currency: string;
};

export type MyShiftResponse = {
  policy: CashPolicy;
  permissions: {
    canOpen: boolean;
    canMove: boolean;
    canClose: boolean;
    canViewExpected: boolean;
    canApproveVariance: boolean;
  };
  session: CashSessionView | null;
};

export function fetchMyShift() {
  return api<MyShiftResponse>("/cash/my-shift");
}

export function fetchCashPolicy() {
  return api<CashPolicy & { canManage: boolean }>("/cash/policy");
}

export function updateCashPolicy(body: Partial<CashPolicy>) {
  return api<CashPolicy & { canManage: boolean }>("/cash/policy", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function idempotent<T>(action: string, body: unknown, run: (key: string) => Promise<T>) {
  const actionKey = idempotencyActionKey(action, body);
  return withIdempotentFinanceCall(actionKey, run);
}

export function openCashSession(body: { openingFloat: string; drawerId?: string }) {
  return idempotent("cash.session.open", body, (key) =>
    api<CashSessionView>("/cash/sessions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );
}

export function createCashMovement(
  cashSessionId: string,
  body: {
    type: Exclude<CashMovementType, "CASH_SALE">;
    amount: string;
    reasonCategory: string;
    note?: string;
  },
) {
  return idempotent("cash.movement.create", { cashSessionId, ...body }, (key) =>
    api<MyShiftResponse>(`/cash/sessions/${cashSessionId}/movements`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );
}

export function submitCashCount(cashSessionId: string, countedAmount: string) {
  const body = { countedAmount };
  return idempotent("cash.count.submit", { cashSessionId, ...body }, (key) =>
    api<{
      cashCountId: string;
      countedAmount: string;
      expectedCash: string;
      variance: string;
      requiresApproval: boolean;
      approvalId: string | null;
      approvalStatus: "PENDING" | "APPROVED" | null;
    }>(`/cash/sessions/${cashSessionId}/counts`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );
}

export function approveCashVariance(
  cashSessionId: string,
  cashCountId: string,
  note?: string,
) {
  const body = { cashCountId, note };
  return idempotent("cash.variance.approve", { cashSessionId, ...body }, (key) =>
    api<{
      approvalId: string;
      status: "APPROVED";
      approvedById: string | null;
      decidedAt: string | null;
    }>(`/cash/sessions/${cashSessionId}/approve-variance`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );
}

export function closeCashSession(
  cashSessionId: string,
  cashCountId: string,
  note?: string,
) {
  const body = { cashCountId, note };
  return idempotent("cash.session.close", { cashSessionId, ...body }, (key) =>
    api<CashSessionView>(`/cash/sessions/${cashSessionId}/close`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );
}

export function fetchCashReports(take = 50) {
  return api<{ sessions: CashSessionView[] }>(`/cash/reports?take=${take}`);
}
