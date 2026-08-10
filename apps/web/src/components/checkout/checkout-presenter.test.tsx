import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CheckoutChargeLine,
  CheckoutPaymentState,
  CheckoutPreview,
} from "@/lib/checkout-client";
import { ChargeGroups } from "./charge-groups";
import { CheckoutTotals } from "./checkout-totals";
import {
  checkoutAccess,
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
  assert.match(html, /Add at least one charge/);
});

test("Chunk 04 tenders clearly expose manual payment methods", () => {
  const html = renderToStaticMarkup(
    <TenderButtons canWrite paymentsEnabled />,
  );
  assert.match(html, /Cash/);
  assert.match(html, /Manual card/);
  assert.match(html, /Split/);
  assert.match(html, /Other/);
  assert.match(html, /does not contact a terminal/);
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
