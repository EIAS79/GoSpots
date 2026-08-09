import { api } from "./api";

export type CheckoutChargeSourceType =
  | "SHOP_ORDER"
  | "PLAY_SESSION"
  | "RESERVATION";

export type CheckoutChargeLine = {
  position: number;
  sourceType: CheckoutChargeSourceType;
  sourceId: string;
  lineReference: string | null;
  description: string;
  quantity: number;
  unitAmount: string;
  grossAmount: string;
  discountAmount: string;
  finalAmount: string;
  currency: string;
  pricingMetadata: unknown;
};

export type CheckoutPreview = {
  checkId: string;
  checkVersion: number;
  sourceHash: string;
  currency: string;
  subtotal: string;
  adjustments: string;
  taxAmount: string;
  depositAmount: string;
  total: string;
  amountDue: string;
  lines: CheckoutChargeLine[];
};

export function previewCheckout(checkId: string, expectedVersion?: number) {
  return api<CheckoutPreview>(`/checkout/checks/${checkId}/preview`, {
    method: "POST",
    body: JSON.stringify(
      expectedVersion === undefined ? {} : { expectedVersion },
    ),
  });
}
