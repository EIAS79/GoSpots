# GoSpots privacy operations

This document extends `DATA_MAP.md` and `RETENTION_POLICY.md` into the operational Phase 16 privacy contract. It is engineering/operations guidance, not jurisdiction-specific legal advice.

## Purpose and minimization

GoSpots processes personal data only for a documented product/operational purpose. Typical purposes include account/security administration, venue service/reservations, payments/invoicing, customer/member benefits, workforce operation, support, fraud prevention, and separately-consented marketing.

Do not collect a profile for an anonymous ordinary sale when the workflow does not require one. Do not reuse operational consent as marketing consent.

## Access

- Tenant/venue access is server-authoritative.
- Support/system-admin access requires the existing permission/audit controls; support must not use direct database editing as a routine support path.
- Sensitive exports are privileged actions and must be attributable to an actor/correlation ID.

## Data-subject access/export

When a verified request is accepted:

1. establish tenant/customer scope and identity using the normal support/privacy process;
2. export only records belonging to that subject/tenant from canonical domains;
3. include linked reservation/customer/membership/consent facts where applicable;
4. do not expose other guests, staff, tenants, secrets, hashes, internal security fields or unrelated financial records;
5. record the request, decision, export date and operator in the privacy/support evidence system.

Existing customer/privacy service code is the application path; database console exports are not the normal product workflow.

## Deletion / anonymization

Deletion is not equivalent to erasing immutable financial/legal history.

- Data with no continuing legal/contract/security need may be deleted according to `RETENTION_POLICY.md`.
- Financial, tax/fiscal, KSeF, ledger, refund, cash and audit facts that require retention remain intact for their lawful retention period.
- Where identity is no longer required but the transaction must remain, detach or anonymize the personal identifiers while preserving the authoritative financial fact and referential integrity.
- Stored-value, membership or unsettled financial obligations must be resolved according to their domain policy before destructive identity actions.
- Cross-tenant/customer records must never be changed by a subject request for another tenant/customer.

## Consent

Consent records must preserve:

- purpose/version;
- grant/revoke state;
- timestamp;
- source/channel where available;
- tenant/customer context.

Marketing consent is separate from service/contract processing. Revoking marketing consent must stop new marketing actions without deleting financial/operational evidence that has another lawful retention basis.

## Processor inventory

Production operators must keep the deployed processor list current. At minimum review the configured production services for:

- hosting/runtime (Render and/or Vercel for the deployed component);
- PostgreSQL provider (Neon for the current production database);
- payment/terminal provider(s) actually enabled;
- fiscal/KSeF providers actually enabled;
- email/SMS provider(s) actually enabled;
- error/observability provider(s) actually enabled;
- object/media storage provider if/when canonical uploaded objects use an external store.

A provider being supported by code does not mean it processes production personal data; inventory only providers actually configured for the environment.

## Incident procedure

For suspected personal-data exposure:

1. preserve evidence and correlation/request IDs; do not delete logs or mutate database history to conceal the symptom;
2. contain the exposure (credential/session revocation, feature/provider isolation, access restriction) using normal controls;
3. identify affected tenant(s), subjects, fields, time window and processor(s);
4. rotate compromised secrets/tokens and invalidate affected sessions/credentials;
5. determine legal notification duties with the responsible privacy/legal operator and applicable deadlines;
6. notify affected tenants/subjects/regulators only through the approved incident process;
7. document root cause, remediation, verification and prevention work;
8. verify backups/exports used during investigation are access-controlled and deleted according to retention policy.

## Retention override rule

`RETENTION_POLICY.md` is the engineering default. Applicable law, accounting/tax/fiscal requirements, litigation hold, security investigation, or an active contractual obligation may require longer retention. The reason and expiry must be documented; indefinite retention by default is prohibited.

## Phase 16 proof

- data categories: `docs/privacy/DATA_MAP.md`;
- retention: `docs/privacy/RETENTION_POLICY.md`;
- operational access/export/deletion/consent/processor/incident contract: this file;
- privacy-domain automated regression: `apps/api/src/modules/growth/growth-privacy.service.spec.ts`;
- tenant/permission regression: normal API + browser CI.
