# Poland fiscal / KSeF operations

## Scope

This runbook covers the GoSpots Poland compliance adapter introduced in Chunk 08. It keeps two legally distinct domains separate:

1. **Fiscal receipt** fiscalization through a configured certified fiscal provider/device bridge.
2. **KSeF invoice** submission through the official KSeF 2.x API.

GoSpots never treats a KSeF invoice as a fiscal cash-register receipt and never treats a provider receipt as a KSeF invoice.

## Product gates

Both production features are disabled when no Shop override exists:

- `fiscal_pl`
- `ksef_pl`

Enable them only for a controlled Poland pilot after the venue profile/tax configuration is reviewed.

## Required configuration

### Secret encryption

`COMPLIANCE_CREDENTIALS_MASTER_KEY`

A 32-byte base64 value or 64-character hex key. KSeF venue tokens are encrypted with AES-256-GCM before persistence and are never returned by API reads.

### KSeF

- `KSEF_ENABLED=true` enables external submission code paths.
- Official defaults:
  - TEST: `https://api-test.ksef.mf.gov.pl/v2`
  - DEMO: `https://api-demo.ksef.mf.gov.pl/v2`
  - PRD: `https://api.ksef.mf.gov.pl/v2`
- Optional endpoint overrides:
  - `KSEF_API_URL_TEST`
  - `KSEF_API_URL_DEMO`
  - `KSEF_API_URL_PRD`
- `KSEF_ACCESS_TOKEN` remains only a controlled testing/emergency compatibility path. Normal venue operation uses the encrypted KSeF system token stored in `ComplianceProfile` and the official challenge/redeem/refresh flow.

GoSpots fetches current KSeF public encryption certificates from `/security/public-key-certificates`, selects the currently valid key for the required usage, and sends `publicKeyId` with encrypted session/token material.

### Fiscal receipt provider

Production receipt fiscalization uses `HTTP_BRIDGE`:

- `FISCAL_PROVIDER_BASE_URL`
- `FISCAL_PROVIDER_HMAC_SECRET`

GoSpots signs each bridge request with `X-GoSpots-Timestamp` and `X-GoSpots-Signature` (HMAC SHA-256).

The `SIMULATED` fiscal connector is non-production only and refuses to operate when `NODE_ENV=production`.

## Venue setup

1. Set Shop country to Poland (`PL`, `Poland`, or `Polska`).
2. Create the compliance profile: legal name, NIP, seller address and KSeF environment/token where invoice submission is required.
3. Create explicit tax categories with effective VAT rates.
4. Map each charge through frozen `ChargeSnapshot.pricingMetadata.taxCategoryCode`, or configure one explicit venue default category.
5. Register the fiscal receipt device/provider if receipts are required.
6. Enable `fiscal_pl` for the Shop.
7. Enable `ksef_pl` and `KSEF_ENABLED=true` only after KSeF pilot credentials are verified.

**GoSpots does not guess VAT.** If a paid charge cannot resolve an active tax category, fiscal-document creation is blocked and the operator must correct configuration.

## Runtime states

Cashier-facing compliance state is intentionally simple:

- `PAID` — payment complete; fiscal document not issued yet.
- `FISCALIZING` — external operation submitted/pending.
- `ISSUED` — immutable provider/KSeF proof accepted.
- `ACTION_REQUIRED` — rejected, unknown or disabled external outcome.

Owner diagnostics compare paid settlements with fiscal documents and expose missing/action-required rows.

## Duplicate protection

A `ComplianceRequest` is persisted before remote submission. Database uniqueness enforces one `(documentId, adapter, operation)` submission operation for an immutable fiscal document.

A second client idempotency key therefore cannot create another legal submission.

If the external outcome is `UNKNOWN`, the document/request stays `UNKNOWN` with `reconciliationRequired=true`. The only safe action is **reconciliation of the existing external reference**. Do not create another receipt/invoice submission.

## KSeF reconciliation

For a known session/invoice reference:

1. query `/sessions/{sessionReference}/invoices/{invoiceReference}`;
2. if accepted, persist the KSeF number as immutable proof;
3. retrieve `/sessions/{sessionReference}/invoices/{invoiceReference}/upo` and persist UPO when available;
4. if rejected, persist the rejection and expose Action required;
5. if status itself is ambiguous/unreachable, remain UNKNOWN and retry reconciliation later.

Never convert a timeout into `FAILED` merely to permit a retry.

## Fiscal-provider reconciliation

For a provider receipt with an external reference, call the connector `status()` path. Accepted proof is immutable. A request with no external reference after an uncertain remote attempt requires manual/provider review and is not automatically resubmitted.

## Corrections and refunds

An accepted original fiscal document is immutable. Corrections/refunds create a new `ComplianceDocument` with `parentDocumentId` lineage. The original record/proofs are never overwritten or deleted by the workflow.

The first KSeF pilot intentionally supports standard domestic Polish B2B VAT invoice payloads only. Unsupported correction/exemption/reverse-charge/legal scenarios must remain blocked until their required FA(3) fields and external review are implemented.

## Rollback / emergency stop

1. Set the Shop `ksef_pl=false` to stop KSeF submissions.
2. Set the Shop `fiscal_pl=false` to stop Poland fiscal operations.
3. Set `KSEF_ENABLED=false` for an environment-wide KSeF kill switch.
4. Do **not** delete compliance documents, requests, events or proofs during rollback.
5. Reconcile all UNKNOWN/SUBMITTED operations before re-enabling.

Disabling the feature changes future workflow availability only; it does not reverse or erase already-issued legal documents.

## Legal/accounting release gate

Chunk 08 engineering completion is **not** a legal certification. Before GoSpots markets or activates Polish fiscal/KSeF compliance for production customers, an external Polish tax/accounting/legal reviewer must review:

- fiscal-receipt obligations for target venue/payment scenarios;
- VAT category mappings and special-rate/exemption scenarios;
- FA(3) invoice coverage and correction/refund procedures;
- provider/device certification and CRK/fiscal-device obligations;
- retention, audit and operator procedures.

Until that review is explicitly signed off, keep production rollout limited and do not claim broad statutory compliance/certification.
