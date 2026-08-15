import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CheckoutChargeLine,
  CheckoutPaymentState,
  CheckoutPreview,
} from "@/lib/checkout-client";
import type { GuestCheck } from "@/lib/guest-check-client";
import { ChargeGroups } from "./charge-groups";
import { CheckoutTotals } from "./checkout-totals";
import { PaymentConfirmation } from "./payment-confirmation";
import {
  checkoutAccess,
  checkoutBillBlockers,
  checkoutCloseErrorMessage,
  checkoutFlowStep,
  checkoutOperationalBlockers,
  classifyCheckoutError,
} from "./checkout-presenter";
import { SettlementStatus } from "./settlement-status";
import { TenderButtons } from "./tender-buttons";

function line(
  position: number,
  sourceType: CheckoutChargeLine["sourceType"],
  description: string,
): CheckoutChargeLine {
  return {
    position,
    sourceType,
    sourceId: `${sourceType.toLowerCase()}-${position}`,
    lineReference: `line-${position}`,
    description,
    quantity: 1,
    unitAmount: "10.0000",
    grossAmount: "10.0000",
    discountAmount: "0.0000",
    finalAmount: "10.0000",
    currency: "PLN",
    pricingMetadata: {},
  };
}

function guestCheck(): GuestCheck {
  return {
    id: "check-1",
    shopId: "shop-1",
    status: "OPEN",
    version: 4,
    currentSettlementId: "settlement-1",
    guestName: "Demo guest",
    guestEmail: null,
    guestPhone: null,
    partySize: 1,
    label: null,
    note: null,
    currency: "PLN",
    paymentMethod: null,
    openedAt: "2026-08-12T08:00:00.000Z",
    settledAt: null,
    voidedAt: null,
    createdById: "user-1",
    createdAt: "2026-08-12T08:00:00.000Z",
    updatedAt: "2026-08-12T08:00:00.000Z",
    shopOrders: [],
    playSessions: [],
    reservations: [],
    runningTotal: "0.0000",
    menuTotal: "0.0000",
    playTotal: "0.0000",
    reservationTotal: "0.0000",
    totalLines: [],
  };
}

const preview: CheckoutPreview = {
  checkId: "check-1",
  checkVersion: 7,
  sourceHash: "hash-1",
  currency: "PLN",
  subtotal: "123.4500",
  adjustments: "0.0000",
  taxAmount: "0.0000",
  depositAmount: "0.0000",
  total: "123.4500",
  amountDue: "123.4500",
  billReady: true,
  blockers: [],
  commercial: {
    discountAmount: "0.0000",
    serviceChargeAmount: "0.0000",
    tipAmount: "0.0000",
    operationsSessionAmount: "0.0000",
    venueOrderAmount: "0.0000",
  },
  lines: [],
};

const partialPayment: CheckoutPaymentState = {
  settlementId: "settlement-1",
  guestCheckId: "check-1",
  guestCheckVersion: 9,
  state: "PARTIALLY_PAID",
  currency: "PLN",
  total: "123.4500",
  paidAmount: "40.0000",
  amountDue: "83.4500",
  payments: [],
};

test("renders one checkout surface with mixed charge groups", () => {
  const html = renderToStaticMarkup(
    <ChargeGroups
      currency="PLN"
      lines={[
        line(0, "PLAY_SESSION", "90 minutes billiards"),
        line(1, "SHOP_ORDER", "Two lemonades"),
        line(2, "RESERVATION", "Table booking"),
      ]}
    />,
  );

  assert.match(html, /Play/);
  assert.match(html, /Food &amp; Drink/);
  assert.match(html, /Booking/);
  assert.match(html, /90 minutes billiards/);
  assert.match(html, /Two lemonades/);
  assert.match(html, /Table booking/);
});

test("owner and checkout operator receive the expected access", () => {
  assert.deepEqual(checkoutAccess("OWNER", ""), { read: true, write: true });
  assert.deepEqual(
    checkoutAccess("STAFF", "checkout.read,checkout.write"),
    { read: true, write: true },
  );
});

test("checkout totals render authoritative values", () => {
  const html = renderToStaticMarkup(<CheckoutTotals preview={preview} />);
  assert.match(html, /123\.45/);
});

test("partial payment renders settlement progress", () => {
  const html = renderToStaticMarkup(
    <SettlementStatus paymentState={partialPayment} />,
  );
  assert.match(html, /Partially paid/);
  assert.match(html, /83\.45/);
});

test("payment confirmation renders a safe explicit confirmation", () => {
  const html = renderToStaticMarkup(
    <PaymentConfirmation
      amount="83.4500"
      currency="PLN"
      method="CASH"
      onConfirm={() => undefined}
      onCancel={() => undefined}
    />,
  );
  assert.match(html, /Confirm payment/);
  assert.match(html, /83\.45/);
});

test("tender buttons expose the supported checkout tenders", () => {
  const html = renderToStaticMarkup(
    <TenderButtons
      disabled={false}
      onSelect={() => undefined}
    />,
  );
  assert.match(html, /Cash/);
  assert.match(html, /Manual card/);
  assert.match(html, /Other/);
});

test("checkout flow remains on bill finalization while blockers exist", () => {
  assert.equal(
    checkoutFlowStep({ ...preview, billReady: false, blockers: [{ type: "VENUE_ORDER", id: "order-1", label: "Seat 1", status: "SENT" }] }, null),
    "FINALIZE_BILL",
  );
});

test("checkout flow advances to payment only after the bill is ready", () => {
  assert.equal(checkoutFlowStep(preview, partialPayment), "PAYMENT");
});

test("checkout access denies staff without checkout permissions", () => {
  assert.deepEqual(checkoutAccess("STAFF", "order.read"), {
    read: false,
    write: false,
  });
});

test("bill blockers are presented as operator-facing messages", () => {
  const blockers = checkoutBillBlockers({
    ...preview,
    billReady: false,
    blockers: [
      {
        type: "VENUE_ORDER",
        id: "order-1",
        label: "Seat 1",
        status: "SENT",
      },
    ],
  });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /Seat 1/);
  assert.match(blockers[0], /SENT/);
});

test("operational blockers include bill finalization state", () => {
  const blockers = checkoutOperationalBlockers(
    { ...preview, billReady: false, blockers: [{ type: "SHOP_ORDER", id: "order-2", label: "Bar order", status: "PENDING" }] },
    null,
  );
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /Bar order/);
});

test("checkout errors classify state conflicts separately from unknown failures", () => {
  assert.equal(classifyCheckoutError({ code: "STATE_CONFLICT" }), "STATE_CONFLICT");
  assert.equal(classifyCheckoutError(new Error("boom")), "UNKNOWN");
});

test("close error message preserves actionable state-conflict guidance", () => {
  assert.match(
    checkoutCloseErrorMessage({ code: "STATE_CONFLICT", message: "Still open" }),
    /Still open/,
  );
});