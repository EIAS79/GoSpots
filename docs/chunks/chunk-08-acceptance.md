# Chunk 08 acceptance checklist

## Engineering gate

- [x] Successful paid settlement can produce an immutable fiscal receipt or supported invoice document from server-authoritative settlement snapshots.
- [x] Explicit tax categories are required; missing tax mapping is blocked rather than guessed.
- [x] Duplicate fiscal/KSeF submission is prevented at the database/domain boundary, including different client idempotency keys.
- [x] Retry behavior is safe: ambiguous/UNKNOWN results are reconciliation-only and do not blindly resubmit.
- [x] Fiscal-provider failures and reconciliation-required states are visible to operators/admin diagnostics.
- [x] KSeF 2.x auth, encryption, FA(3) generation, submission state handling, reconciliation, KSeF-number persistence and UPO handling are implemented and covered by automated tests for the supported pilot scope.
- [x] Fiscal receipt provider/device integration is isolated behind a provider-neutral connector; simulation is prohibited in production.
- [x] Rollout, kill-switch and rollback procedures are documented.

## External production release gate

- [ ] Live KSeF TEST/DEMO credential pilot completed with the intended production credential model.
- [ ] Certified fiscal provider/device pilot completed for the target receipt scenarios.
- [ ] Polish tax/accounting/legal review signed off for the target venue/payment/tax scenarios.

The unchecked items above do not block merging the engineering implementation behind disabled production feature flags. They **do block broad production activation and any claim that GoSpots is legally certified/compliant for all Polish fiscal/KSeF scenarios**.

See `chunk-08-completion.md` and `docs/operations/poland-compliance-ksef.md`.
