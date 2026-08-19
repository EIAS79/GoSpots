# GoSpots production runbook

Audience: trained venue/operator support and GoSpots operations.

Core rule: diagnose and recover through application/provider/infrastructure controls. **Do not manually edit production database rows to make an incident disappear.** Escalate if the supported recovery path cannot preserve canonical financial/operational truth.

## First five minutes

1. Record environment, tenant/venue, affected workflow, UTC/local time and user-visible error.
2. Capture `x-request-id` / correlation ID, entity IDs and provider reference where applicable.
3. Check API `/live` and `/ready`; check deployment/runtime health and current production revision.
4. Check `/metrics`/monitoring: error rate, route latency, DB latency, payment unknown, provider/fiscal/KSeF, Edge, print/KDS, notification queue, login failures.
5. Determine blast radius: one user/device, one venue, one provider, or system-wide.
6. Preserve evidence. Do not retry financial uncertainty blindly.

## Payment stuck / UNKNOWN

Symptoms: terminal timeout, cashier sees uncertain payment, `gospots_payment_unknown > 0`.

1. Locate `PaymentOperation` through the supported reconciliation/operator UI using provider/payment reference.
2. Query/reconcile with the configured provider; do **not** treat timeout as decline.
3. If provider says succeeded, let canonical reconciliation settle exactly once.
4. If provider says failed/cancelled, resolve through the normal payment state path and allow another tender only after certainty.
5. If provider remains unavailable, leave the check/payment in explicit uncertainty and hand over with evidence.

Escalate if the oldest unknown age exceeds the payment SLO or reconciliation produces contradictory provider evidence.

## Duplicate charge suspicion

1. Do not create a compensating payment or delete a payment row.
2. Compare idempotency key/request hash, provider references, `PaymentOperation`, settlement/payment and ledger facts.
3. Query provider transactions for the same customer/time/amount.
4. If an actual duplicate exists, use the normal authorized refund path for the duplicate transaction.
5. Preserve original and refund evidence.

## Cash mismatch

1. Recount using venue blind-count policy if enabled.
2. Review opening float, cash sales/refunds, paid-in/out, safe drops and handover movements.
3. Compare expected vs counted cash and the ledger/reconciliation center.
4. Require manager approval/reason where threshold policy applies.
5. Never edit a payment or cash movement to force variance to zero.

## KSeF failed / backlog

1. Check `gospots_ksef_backlog` and oldest backlog age plus provider/KSeF environment status.
2. Open the invoice/submission evidence; confirm duplicate-prevention/idempotency reference.
3. Distinguish ordinary provider failure from a legally certified outage/special mode.
4. Retry only through the KSeF submission/reconciliation workflow.
5. Preserve KSeF number/UPO/status/evidence when returned.
6. Follow legal deadlines for offline24/special modes; generic network-offline rules do not replace KSeF rules.

## Fiscal printer/provider unavailable

1. Verify sale/payment state independently; fiscal failure does not make a paid sale unpaid.
2. Check fiscal document state, configured device/provider and `gospots_fiscal_failures`.
3. Verify device health, network/power and assignment.
4. Retry/reconcile using the fiscal workflow; do not duplicate the commercial sale.
5. Apply the venue's legally approved continuity procedure if hardware remains unavailable.

## Database issue

1. Check API `/live` and `/ready`; liveness up + readiness down indicates dependency failure.
2. Check `gospots_db_query_latency_ms`, Neon status/connection limits and runtime logs.
3. Stop high-risk retry loops if the DB is unstable; financial mutations require authoritative persistence.
4. Recover the database/provider connection through infrastructure controls.
5. If restoration is required, follow `DISASTER_RECOVERY.md`; validate migration state and canonical counts before reopening writes.
6. Never repair business facts with ad-hoc SQL during an outage.

## Edge offline / sync backlog

1. Confirm WAN vs LAN vs Edge-host failure and `gospots_edge_sync_backlog`/oldest age.
2. Keep only operations certified by the Phase 12 offline capability matrix enabled.
3. Preserve local durable queue; do not clear it to remove an alert.
4. Restore Edge process/network; allow deterministic replay using existing operation IDs/idempotency keys.
5. Route conflicts to operator resolution; never silently merge payment/refund/cash-close/fiscal conflicts.
6. Run Phase 12 reconciliation before declaring convergence.

## Printer / KDS issue

1. Check device assignment/last seen, print-job status and `gospots_print_failures`.
2. For KDS, inspect oldest live ticket age and station routing; ensure ticket was not silently dropped.
3. Restore power/LAN/process; retry the same durable print job where allowed rather than creating a second business transaction.
4. Use approved fallback routing/manual continuity where configured.
5. Confirm pending tickets/jobs clear after recovery.

## Device replacement

1. Disable/revoke the old device credential/assignment.
2. Register/claim the replacement to the correct venue/station.
3. Rotate credentials rather than copying secret material from logs/files.
4. Run health/readiness/printing/payment/Edge pairing tests applicable to the device.
5. Audit the reassignment and confirm the old device can no longer act.

## Reservation/deposit provider issue

1. Preserve reservation and deposit state separately from provider availability.
2. Check webhook signature/replay evidence and provider reference.
3. Reconcile duplicate/late callbacks idempotently.
4. Do not mark an unpaid/unknown deposit as paid merely to seat a guest; use explicit manager/business policy if service proceeds.
5. On recovery, reconcile deposit application/refund exactly once.

## Tenant lockout

1. Verify identity and tenant/venue scope before changing access.
2. Check account lock state, login-failure metrics, session/device list and recent audit events.
3. Use password recovery/session revocation/admin access controls; do not alter credential hashes in DB.
4. Re-enable access only after the suspicious-access procedure below is satisfied when compromise is possible.

## Suspicious account access

1. Revoke affected sessions/credentials and rotate compromised secrets.
2. Preserve IP/device/request IDs and audit evidence.
3. Check permission/feature changes, refunds, discounts, cash movements, inventory corrections and support/admin actions in the affected window.
4. Scope affected tenants/data and follow `docs/privacy/PRIVACY_OPERATIONS.md` if personal data may be exposed.
5. Correct business facts only through normal reversal/refund/correction workflows.
6. Document root cause and preventive action before closing the incident.

## Notification provider unavailable

1. Check durable mail/notification outbox depth and oldest pending age.
2. Confirm provider credentials/status without logging secrets.
3. Keep queued actions durable; do not mass-recreate messages.
4. Restore provider/worker and confirm idempotent delivery/retry.
5. Escalate critical notification SLO breach.

## Worker restart / queue recovery

1. Restart only through the runtime/service manager.
2. Confirm durable jobs/outbox rows remain and worker leases/locks expire normally.
3. Verify retries do not duplicate provider actions; check idempotency/delivery evidence.
4. Confirm backlog converges and dead-letter items remain visible for explicit resolution.

## Incident close criteria

- canonical state reconciles;
- no silent `UNKNOWN`/pending financial state remains unexplained;
- affected alerts/SLOs recover;
- tenant/security/privacy scope is known;
- remediation was performed through supported workflows;
- relevant request IDs, deployment revision, root cause and follow-up are recorded.
