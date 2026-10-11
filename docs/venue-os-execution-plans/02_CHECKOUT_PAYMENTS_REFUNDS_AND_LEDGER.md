# 02 — Money Authority: GuestCheck, Settlement, Card/Cash, Refunds and Ledger

**Classification:** `CONFIRMED_FINDING` for direct manual-card API path; `COVERED_VERIFY_DEPTH` for provider and ledger | **Priority:** P0 | **Maps to:** P4/P5, R4/R11/R12.

## Verified starting facts, not assumptions

The normal web card tender in `apps/web/src/components/checkout/split-payment-panel.tsx` routes through the Adyen provider checkout flow; issue #89 was closed. The provider checkout service protects `CAPTURED` vs `UNKNOWN` and attempts idempotent settlement/refund linkage. **Do not rebuild it as though Adyen were disconnected.** Separately, `POST /checkout/settlements/:id/payments` invokes `CheckoutPaymentService.createPayment()` with a DTO supporting `MANUAL_CARD` and, in inspected source, can create locally successful payments without a confirmed provider capture. It requires `CHECKOUT_WRITE` but no separately proven supervisor-only card attestation. This is a **risk of falsely marking an unpaid card as paid**, not a confirmed fraud incident.

## Canonical financial state machine

`GuestCheck (open/edited)` → `Settlement snapshot (immutable allocation and taxes)` → `PaymentAttempt` → `Payment evidence (provider CAPTURED / permitted signed cash tender / separately privileged external-card exception)` → `Applied tender allocations` → `Ledger journals` → `Fiscal/invoice events` → `End-of-day reconciliation`. Refunds and reversals create new immutable facts with original-payment lineage. Provider communications never directly rewrite a past charge snapshot.

Invariants (implement in minor units/decimal utilities, never binary floating point):

1. Settlement hash/version/tax rounding stays immutable after issuance; stale check versions reject double checkout.
2. Sum of successful tender allocation minus authorized refunds and reversals reconciles to settled due or explicit outstanding balance; **do not force `paid <= due` when genuine overpayment/change or account-credit semantics are explicitly supported**—model these separately.
3. A `REQUESTED/UNKNOWN/DECLINED` payment cannot act as `CAPTURED` in the default online Adyen flow.
4. For each capture or cash tender, exactly one matching allocation and journal entry is effective, despite retry, duplicate callback, timeout or process crash.
5. Refund sum cannot exceed refund-eligible paid amount across concurrent operators, independent of downstream webhook delivery order.
6. Cash drawer events, provider captures, payout settlement and bank receipt are separate layers; paid status does not imply bank payout complete.

## Engineering tasks

### A. Close generic MANUAL_CARD bypass

Inventory all callers of the generic payment controller and `CheckoutPaymentMethod`, including API clients, offline replay, Edge, public UI, tests and back-office. Make regular card intent available **only** through provider-authorized capture flow. If 'external manual card' is a real supported operation, create a distinct command `recordExternallyCapturedCard` with high-risk permission such as `CHECKOUT_MANUAL_CARD_ATTEST`, supervisory approval/step-up, mandatory receipt reference, location/device/merchant metadata, reason and immutable audit. Never misrepresent it as Adyen-captured: mark tender `EXTERNAL_ATTESTED` or `PROVISIONAL_UNRECONCILED` and establish clearance rules. Decide whether only post-settlement discrepancy correction permits it; default **disabled** per venue. If external card is not a required product promise, remove it from write DTO (with safe backwards compatibility plan).

### B. Provider operation ledger and state recovery

Persist immutable request IDs/idempotency keys and body hashes, settlement ID, provider merchant/account/terminal identifiers, attempt states, PSP/tender references, accepted/captured/cancelled/refunded timestamps and vendor error codes **without PAN/CVV**. Introduce a reconciliation worker with bounded backoff and an operator queue for `UNKNOWN`, including provider TransactionStatus lookup and vendor report matching; a network timeout must not turn into a second charge. Partition failure handling by retryable vs terminal. Deduplicate callbacks by provider event ID and transaction natural key. Specify payment 'approved' vs 'authorized' vs 'captured' meaning and whether settlement is synchronous/asynchronous.

### C. Refunds and corrections

Refund only from original eligible Payment/ChargeSnapshot through provider referenced refund, with concurrency-safe reservation of refundable amount. Cover partial cash+card splits, deposit refund, tip refund, fiscal corrections, refund race and provider negative confirmation. Cash refund must create drawer outflow; provider refund must **not** change cash. A chargeback/dispute (Plan 04) is not a normal customer-requested refund. Ledger corrections are counter-entries; never patch a settled payment to erase history.

### D. Prices, tax and tip contracts

Define explicit minor-unit allocation with rounding remainder assigned deterministically, per-line VAT category snapshots, zero price/comp vs discount, service charge vs tip vs stored value, return of deposit, customer overpay/change, and cross-business-day session timing. Define business document relationship: receipt can be produced only according to fiscal adapter state; card terminal printout does not satisfy it.

## Required adversarial matrix

| Scenario | Expected result |
| --- | --- |
| Cashier directly calls `MANUAL_CARD` without privileged evidence | 403/rejected or expressly noncaptured pending exception, **never successful provider-backed card** |
| Provider captured then API HTTP timeout | Read/reconcile original attempt; never charge twice |
| Duplicate/late Adyen webhook | One economic event, idempotent replay log |
| Two cashiers press pay simultaneously | One successful application, version conflict or idempotent same result |
| Terminal declines after check creation | Check remains unpaid; customer can safely choose another tender |
| `UNKNOWN` persists during outage | Queued recovery; no optimistic paid state and visible operator attention |
| Partial mixed tender cash+card with partial refund | Correct lineage, tax and drawer updates |
| Refund arrives after fiscal day close | Next business day correcting event; prior day historical snapshot preserved |
| Provider card payment on wrong tenant/terminal | Denied and audited, never cross-allocated |
| Client replays altered body under same idempotency key | Conflict on request hash, not changed amount |

## Definition of done

Core invariant/property tests + PostgreSQL concurrency + API negative auth + browser busy-shift + real Adyen provider capture/decline/UNKNOWN/refund/cancel + payout and ledger reconciliation; financial exception dashboard zero unexplained items; no normal recovery via raw SQL; security review of privileged manual tender. Finance owner signs `financial-reconciliation-evidence.md`. No GA until S0/S1 resolved.

**Primary source anchors:** `apps/api/src/modules/checkout/checkout.controller.ts`, `checkout-payment.service.ts`, `provider-checkout-payment.service.ts`, `provider-checkout-refund.service.ts`, `apps/api/src/modules/checkout/dto/chunk04.dto.ts`, `apps/web/src/components/checkout/split-payment-panel.tsx`.
