# Chunk 08 — Poland Fiscalization + KSeF — completion record

## Status

**Engineering implementation complete behind feature flags. Production compliance activation is not authorized by this record.**

Chunk 08 implements the Poland-specific compliance boundary without changing existing checkout/tender authority. The Poland adapter remains disabled unless the Shop is explicitly enabled with `fiscal_pl`; KSeF additionally requires `ksef_pl` and the environment kill switch `KSEF_ENABLED=true`.

## Delivered

### Durable compliance domain

- `ComplianceProfile` for seller identity, jurisdiction, KSeF environment and encrypted per-Shop KSeF token.
- Explicit `TaxCategory` catalogue with exact Decimal rates.
- `FiscalDevice` registry for provider/device mapping.
- Immutable `ComplianceDocument` + fiscal line snapshots derived from paid `CheckSettlement` snapshots.
- `ComplianceRequest`, `ComplianceEvent` and `ComplianceProof` durable audit/proof records.
- Shop-scoped RLS and indexes for all new tenant data.
- Database uniqueness for one legal submission operation per immutable document/adapter/operation.

### Tax and document generation

- Fiscal documents are generated from server-authoritative settlement snapshots, never from client-supplied totals.
- Tax is resolved from explicit frozen line metadata or an explicit venue default tax category.
- Missing/invalid tax configuration blocks document generation; GoSpots does not infer a VAT rate.
- Exact Decimal conservation is enforced: line net + tax = gross and document totals conserve the paid settlement amount.
- Accepted documents/proofs are immutable; corrections/refunds use document lineage rather than destructive mutation.

### Fiscal receipt boundary

- Provider-neutral `FiscalConnector` contract.
- `HTTP_BRIDGE` connector for configured certified fiscal provider/device bridges with HMAC request signing.
- `SIMULATED` connector for non-production testing only; it refuses production execution.
- Provider `UNKNOWN` results remain reconciliation-only. No automatic second fiscalization is allowed.
- Accepted fiscal receipt identifiers/proofs are persisted durably.

### KSeF 2.x

- Current TEST/DEMO/PRD environment routing.
- Official challenge + KSeF-token authentication flow.
- Current public certificate discovery through `/security/public-key-certificates` with rotation-aware `publicKeyId` selection.
- RSA-OAEP SHA-256 token/key encryption and AES-256-CBC invoice session payload encryption.
- FA(3) standard domestic B2B VAT invoice builder for the supported pilot scope.
- Online session open, invoice submission, status reconciliation, KSeF number persistence and UPO proof retrieval when available.
- Per-Shop KSeF token encrypted at rest with AES-256-GCM using `COMPLIANCE_CREDENTIALS_MASTER_KEY`.
- Duplicate submission is prevented even if a caller changes the client idempotency key.
- `UNKNOWN` KSeF outcomes can only reconcile the same external session/invoice reference; blind resubmission is blocked.

### Operator/admin UI

- Checkout compliance state for paid settlements: `PAID`, `FISCALIZING`, `ISSUED`, `ACTION_REQUIRED`.
- Receipt/invoice document generation actions are server-authoritative.
- Poland compliance admin/diagnostic surface for seller profile, tax configuration, fiscal devices and paid-settlement reconciliation.
- No client-side authoritative tax calculation.

## Automated acceptance

The Chunk 08 test suite covers, among other cases:

- exact settlement-to-fiscal tax conservation;
- refusal to guess an unmapped tax rate;
- immutable settlement-derived line snapshots;
- duplicate KSeF/fiscal submission prevention;
- `UNKNOWN` -> reconcile-only behavior;
- KSeF cryptographic primitives and FA(3) generation;
- durable proof/identifier behavior.

The repository CI gate requires:

1. API Jest suite;
2. API TypeScript/Nest build;
3. web Checkout UI tests + typecheck + build;
4. fresh PostgreSQL 16 `prisma migrate deploy`, `migrate status`, and `prisma validate`.

The exact final CI run/SHA is recorded on PR #21 immediately before merge; post-merge `main` CI must also be green before Chunk 09 begins.

## Rollout

1. Deploy schema/code with `fiscal_pl` and `ksef_pl` disabled for production Shops.
2. Configure and review a Poland venue compliance profile and explicit tax categories.
3. Configure a certified fiscal device/provider bridge if receipts are in scope.
4. Configure encrypted KSeF credentials and verify TEST/DEMO operation before any PRD enablement.
5. Enable one controlled Shop first; reconcile every `SUBMITTED`/`UNKNOWN` request before expansion.

## Rollback / emergency stop

- Set Shop `ksef_pl=false` to stop KSeF operations.
- Set Shop `fiscal_pl=false` to stop Poland fiscal operations.
- Set `KSEF_ENABLED=false` for an environment-wide KSeF kill switch.
- Never delete legal/compliance documents, requests, events or proofs as rollback.
- Reconcile all outstanding `SUBMITTED`/`UNKNOWN` operations before re-enabling.

See `docs/operations/poland-compliance-ksef.md` for the operational runbook.

## External production release gate

This engineering completion record is **not legal certification** and must not be used to market GoSpots as broadly compliant with Polish fiscal/KSeF obligations.

Before production marketing/activation for customers, obtain documented Polish tax/accounting/legal review of the target business scenarios, VAT mappings, FA(3) coverage, correction/refund handling, certified fiscal provider/device obligations, retention, audit and operator procedures. Unsupported legal/tax cases remain blocked rather than guessed.

A live KSeF TEST/DEMO credential pilot and certified fiscal-provider/device pilot are operational release evidence, not something repository CI can fabricate without the external credentials/devices. Keep the production flags off until those pilot checks and the external review are complete.
