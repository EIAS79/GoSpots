# Phase 17 — Real Adyen Provider Evidence — 2026-09-14

Status: `PARTIAL_EVIDENCE / SOFTWARE_CHECKOUT_GAP_BLOCKS_ACCEPTANCE`

## Environment observed

Real Customer Area evidence supplied during Phase 17 closure confirms:

- merchant account: `GoSpotsPOS`;
- API credential: `GoSpots Terminal API`;
- Cloud Device API role enabled;
- boarded physical terminal: Castles `S1F4Pro`;
- terminal identifier: `S1F4Pro-000195254265039`;
- GoSpots device registry contains an enabled/claimed Adyen S1F4Pro payment terminal;
- an Adyen Standard webhook targeting `https://gospots.onrender.com/api/v1/payments/webhooks/adyen` is active;
- a second legacy-looking webhook targeting `https://gospots-api.onrender.com/api/v1/payments/webhooks/adyen` is failing and must not be removed until the canonical backend hostname is verified.

No API key, HMAC key, card secret, PAN or other provider secret is recorded in this evidence file.

## Real provider transactions observed

The Adyen payment list for merchant account `GoSpotsPOS` showed these real TEST transactions:

| Provider timestamp | Amount | Observed provider result |
| --- | ---: | --- |
| 2026-09-14 11:26:02 | EUR 1.23 | Refused/declined; corresponds to the GoSpots Phase 17 decline certification test |
| 2026-09-14 11:00:11 | EUR 1.00 | Provider transaction present; final state requires exact-detail reconciliation before acceptance |
| 2026-09-12 07:45:13 | EUR 1.00 | Successful/settled indication in Adyen Customer Area |
| 2026-09-11 11:05:07 | EUR 1.00 | Successful/settled indication in Adyen Customer Area |

The operator also reports having physically exercised payment, cancellation, rejection/decline and terminal receipt printing. The successful and declined provider records above independently support payment/decline activity. Cancellation still requires provider/local evidence linkage before being checked off.

A terminal-printed Adyen receipt is payment-terminal evidence only. It does not satisfy the separate Polish fiscal-printer/provider certification gate.

## Software defect discovered during real-provider closure

Real-provider certification exposed a material gap in the normal GoSpots checkout path:

- `Card · external terminal` is currently a manual record-only tender in the checkout UI;
- `CheckoutPaymentService.createPayment()` records that checkout payment directly as `SUCCESS` and its audit metadata explicitly records `providerChargeCreated: false`;
- the real provider lifecycle exists separately through `PaymentOperation` / the Adyen connector and is exercised by the settings certification panel;
- therefore the normal GuestCheck card tender is not yet using the Adyen `PaymentOperation` as its payment authority.

This contradicts the Phase 5 / financial acceptance intent for card success, decline, timeout/reconciliation, duplicate webhook and refund lineage, and blocks truthful Gate P17 acceptance even though standalone terminal requests work.

Tracked by GitHub issue #89: `Phase 17: wire checkout card tender to canonical Adyen PaymentOperation lifecycle`.

## Acceptance consequence

The following real-provider requirements are not yet closed:

- normal checkout card success linked provider -> checkout Payment -> settlement;
- decline leaves the check due without payment fiction;
- timeout/`UNKNOWN` followed by TransactionStatus recovery and exactly-once local settlement;
- cancel evidence linked to the same canonical operation;
- referenced refund using original checkout `PaymentAllocation` lineage;
- duplicate real webhook delivery remains harmless;
- final provider/GoSpots reconciliation with no duplicate charge or refund.

Do not mark the Adyen external gate complete until issue #89 is resolved, the integrated flow is deployed, and the remaining physical provider scenarios above are evidenced.