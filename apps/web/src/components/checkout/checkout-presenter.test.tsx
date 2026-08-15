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

test("unauthorized staff is read/write denied and payment controls stay disabled", () => {
  assert.deepEqual(checkoutAccess("STAFF", "reservation.read"), {
    read: false,
    write: false,
  });
  const html = renderToStaticMarkup(<TenderButtons canWrite={false} />);
  assert.match(html, /disabled/);
  assert.match(html, /Payment unlocks only when/);
});

test("payment choices make manual/external boundaries explicit", () => {
  const html = renderToStaticMarkup(
    <TenderButtons canWrite paymentsEnabled />,
  );
  assert.match(html, /Cash/);
  assert.match(html, /Card · external terminal/);
  assert.match(html, /Split payment/);
  assert.match(html, /Other received/);
  assert.match(html, /does not charge the card itself/);
});

test("external-terminal card confirmation cannot be mistaken for charging a card", () => {
  const html = renderToStaticMarkup(
    <PaymentConfirmation
      method="MANUAL_CARD"
      amount="200.0000"
      currency="PLN"
      onConfirm={() => undefined}
      onCancel={() => undefined}
    />,
  );
  assert.match(html, /Confirm payment/);
  assert.match(html, /200\.00/);
  assert.match(html, /separate card terminal or processor/i);
  assert.match(html, /does not charge the card/i);
  assert.match(html, /Record approved card payment/);
  assert.match(html, /Cancel/);
});

test("cash confirmation states that the amount is posted to the cash shift", () => {
  const html = renderToStaticMarkup(
    <PaymentConfirmation
      method="CASH"
      amount="40.0000"
      currency="PLN"
      onConfirm={() => undefined}
      onCancel={() => undefined}
    />,
  );
  assert.match(html, /Confirm cash received/);
  assert.match(html, /currently open cash shift/i);
});

test("final-bill gate blocks mutable orders and running standalone play", () => {
  const check = guestCheck();
  check.shopOrders.push({
    id: "order-12345678",
    status: "OPEN",
    total: "20.0000",
    label: "Table 4 order",
    reservationFee: null,
    guestCount: 1,
    createdAt: check.createdAt,
    completedAt: null,
  });
  check.playSessions.push({
    id: "play-standalone",
    status: "ACTIVE",
    amount: "40.0000",
    reservationId: null,
    label: "Pool table 2",
    startedAt: check.createdAt,
    endedAt: null,
    completedAt: null,
  });

  const blockers = checkoutBillBlockers(check);
  assert.equal(blockers.length, 2);
  assert.equal(blockers[0]?.action, "orders");
  assert.equal(blockers[1]?.action, "sessions");
});

test("ended standalone play is bill-final before its paid completion stamp", () => {
  const check = guestCheck();
  check.playSessions.push({
    id: "play-ended",
    status: "ACTIVE",
    amount: "40.0000",
    reservationId: null,
    label: "Pool table 2",
    startedAt: check.createdAt,
    endedAt: "2026-08-12T09:00:00.000Z",
    completedAt: null,
  });

  assert.equal(checkoutBillBlockers(check).length, 0);
  assert.equal(checkoutOperationalBlockers(check).length, 0);
});

test("checkout close readiness blocks live orders and reservation-linked play, but not booking payment twice", () => {
  const check = guestCheck();
  check.shopOrders.push({
    id: "order-12345678",
    status: "OPEN",
    total: "20.0000",
    label: "Table 4 order",
    reservationFee: null,
    guestCount: 1,
    createdAt: check.createdAt,
    completedAt: null,
  });
  check.playSessions.push({
    id: "play-12345678",
    status: "ACTIVE",
    amount: "40.0000",
    reservationId: "reservation-1",
    label: "Pool table 2",
    startedAt: check.createdAt,
    endedAt: null,
    completedAt: null,
  });
  check.reservations.push({
    id: "reservation-1",
    guestName: "Demo guest",
    billedAmount: null,
    billedAt: null,
    resourceId: "resource-1",
    startsAt: check.createdAt,
    endsAt: check.createdAt,
    status: "CONFIRMED",
  });

  const blockers = checkoutOperationalBlockers(check);
  assert.equal(blockers.length, 2);
  assert.equal(blockers[0]?.action, "orders");
  assert.equal(blockers[1]?.action, "sessions");
  assert.doesNotMatch(JSON.stringify(blockers), /reservation.*paid/i);
});

test("checkout flow step always tells the operator what to do next", () => {
  assert.equal(
    checkoutFlowStep({
      lineCount: 0,
      paymentStarted: false,
      fullyPaid: false,
      blockerCount: 0,
      billBlockerCount: 0,
    }),
    1,
  );
  assert.equal(
    checkoutFlowStep({
      lineCount: 3,
      paymentStarted: false,
      fullyPaid: false,
      blockerCount: 1,
      billBlockerCount: 1,
    }),
    2,
  );
  assert.equal(
    checkoutFlowStep({
      lineCount: 3,
      paymentStarted: false,
      fullyPaid: false,
      blockerCount: 0,
      billBlockerCount: 0,
    }),
    3,
  );
  assert.equal(
    checkoutFlowStep({
      lineCount: 3,
      paymentStarted: true,
      fullyPaid: true,
      blockerCount: 0,
      billBlockerCount: 0,
    }),
    4,
  );
});

test("technical attached-children close errors are never shown to cashiers", () => {
  assert.equal(
    checkoutCloseErrorMessage({
      message: "Guest check cannot settle until attached children are closed",
    }),
    "Payment is complete, but a live order or play session is still open. Finish it first, then close the check.",
  );
});

test("state conflicts use the required reload message", () => {
  assert.equal(
    classifyCheckoutError({ status: 409, code: "VERSION_CONFLICT" }),
    "conflict",
  );
  const html = renderToStaticMarkup(<SettlementStatus issue="conflict" />);
  assert.match(
    html,
    /This check changed on another device\. Reloading latest total\./,
  );
});

test("offline checkout uses the required connection message", () => {
  assert.equal(classifyCheckoutError({ status: 0 }), "offline");
  const html = renderToStaticMarkup(<SettlementStatus issue="offline" />);
  assert.match(
    html,
    /Checkout requires connection until Offline Checkout is enabled\./,
  );
});

test("loading and empty charge states render explicitly", () => {
  const loading = renderToStaticMarkup(<SettlementStatus loading />);
  assert.match(loading, /Refreshing authoritative checkout total/);

  const empty = renderToStaticMarkup(
    <ChargeGroups lines={[]} currency="PLN" />,
  );
  assert.match(empty, /This check is empty/);
  assert.match(empty, /add a menu item/i);
  assert.match(empty, /reservation/i);
});

test("large check item counts render without a second checkout implementation", () => {
  const lines = Array.from({ length: 120 }, (_, index) =>
    line(
      index,
      index % 2 === 0 ? "SHOP_ORDER" : "PLAY_SESSION",
      `Item ${index + 1}`,
    ),
  );
  const html = renderToStaticMarkup(
    <ChargeGroups lines={lines} currency="PLN" />,
  );
  assert.match(html, /Item 1/);
  assert.match(html, /Item 120/);
});

test("amount due is rendered from the server preview without client summation", () => {
  const html = renderToStaticMarkup(<CheckoutTotals preview={preview} />);
  assert.match(html, /Amount due/);
  assert.match(html, /123\.45/);
  assert.match(html, /Check total/);
  assert.match(html, /Live bill/);
});

test("partial payment totals use settlement progress rather than the original bill due", () => {
  const html = renderToStaticMarkup(
    <CheckoutTotals preview={preview} paymentState={partialPayment} />,
  );
  assert.match(html, /Partially paid/);
  assert.match(html, /40\.00/);
  assert.match(html, /83\.45/);
});