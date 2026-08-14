import { api } from "./api";

export type OperationsBillingMode =
  | "HOURLY"
  | "PER_MINUTE"
  | "FIXED_PRICE"
  | "FIXED_DURATION"
  | "PER_PERSON"
  | "PER_GAME"
  | "FREE";

export type OperationsRatePlan = {
  id: string;
  version: number;
  name: string;
  resourceId: string | null;
  resourceCategoryId: string | null;
  billingMode: OperationsBillingMode;
  hourlyRateMinor: number;
  unitPriceMinor: number;
  roundingMinutes: number;
  minimumMinutes: number;
  active: boolean;
};

export function fetchOperationsRatePlans() {
  return api<OperationsRatePlan[]>("/operations/rate-plans");
}

export function createOperationsRatePlan(body: {
  name: string;
  resourceId?: string;
  resourceCategoryId?: string;
  billingMode: OperationsBillingMode;
  hourlyRateMinor?: number;
  unitPriceMinor?: number;
  roundingMinutes?: number;
  minimumMinutes?: number;
  active?: boolean;
}) {
  return api<OperationsRatePlan>("/operations/rate-plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateOperationsRatePlan(
  id: string,
  body: { expectedVersion: number } & Partial<{
    name: string;
    billingMode: OperationsBillingMode;
    hourlyRateMinor: number;
    unitPriceMinor: number;
    roundingMinutes: number;
    minimumMinutes: number;
    active: boolean;
  }>,
) {
  return api<OperationsRatePlan>(`/operations/rate-plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
