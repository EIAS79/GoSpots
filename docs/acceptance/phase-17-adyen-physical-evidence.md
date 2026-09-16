# Phase 17 — Adyen Physical Certification Evidence

Status: `IN_PROGRESS`

This record contains real-provider / real-terminal evidence for the Phase 17 Adyen card-present certification matrix. It complements `phase-17-adyen-terminal-certification.md`, which covers software semantics and automated release evidence.

## Certified environment

- GoSpots production API revision exercised: `fc60bb98612a89eeb5aa10af1922cdf7dc16a4cd`.
- Production readiness was independently probed through `https://www.gospots.eu/api/v1/ready` and returned `status=ok` with the exact revision above.
- Merchant account: `GoSpotsPOS`.
- Provider: Adyen test environment.
- Physical terminal: Castles S1F4Pro.
- GoSpots terminal mapping: claimed Adyen payment terminal.

## Real-terminal evidence matrix

| Scenario | Status | Evidence |
| --- | --- | --- |
| Successful card-present payment | Pending | Required next. |
| Decline / refusal | **PASS** | Real €1.23 certification transaction on 2026-09-16 01:42:39 +02:00. Physical S1F4Pro displayed Polish refusal (`Odmowa`) and printed both cardholder and merchant copies marked `ODRZUCONO`. GoSpots canonical operation `cmu3c0v4k000ybj1gam46uxt3` returned `Refusal: 214 Declined online` in the Payment terminal certification panel. |
| Timeout / uncertain outcome | Pending | Must enter `UNKNOWN` without blind retry. |
| TransactionStatus recovery | Pending | Must reconcile the same uncertain operation. |
| Cancel while in progress | Pending | Must verify AbortRequest + provider status result. |
| Referenced refund | Pending | Must originate from a captured GoSpots checkout payment. |
| `CANCEL_OR_REFUND` webhook | Pending | Must be observed against the referenced refund. |
| Duplicate webhook delivery | Pending | Must prove duplicate-safe canonical state. |
| Late refund failure/reversal | Pending / provider capability dependent | Required where Adyen test environment supports it. |
| Provider ↔ GoSpots final reconciliation | Pending | Must show no duplicate payment or refund and canonical amounts agree. |

## Decline certification — PASS

The decline case is now closed end-to-end, not merely at the terminal UI layer:

1. GoSpots initiated the physical certification operation against the claimed S1F4Pro.
2. The S1F4Pro processed the €1.23 test transaction and physically refused it.
3. The terminal displayed `Odmowa` and printed refusal receipts for both cardholder and merchant copies.
4. GoSpots stored the same provider result under operation `cmu3c0v4k000ybj1gam46uxt3`.
5. The GoSpots certification panel reported `Refusal: 214 Declined online` and treated that refusal as the expected successful certification outcome.

This satisfies the Phase 17 real-provider **decline** requirement. It does not satisfy the remaining success, uncertainty/recovery, cancellation, refund, webhook, and final-reconciliation scenarios.

## Acceptance boundary

Phase 17 remains `SOFTWARE_DONE / BLOCKED_EXTERNAL` overall until the complete Adyen matrix plus fiscal/KSeF/legal/hardware/pilot evidence is complete. This file must not be interpreted as accepting the entire Phase 17 gate from one terminal scenario.
