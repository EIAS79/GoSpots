# GoSpots Integration Policy

## 1. Principle

GoSpots owns venue operations. Integrations extend the product; they do not define or replace its core business state.

The integrations platform may connect GoSpots to externally useful capabilities, but another POS product is not a dependency or release gate for GoSpots.

## 2. Allowed adapter roles

Examples:

- payment/acquiring provider;
- in-person payment terminal;
- fiscal transport/device;
- KSeF transport;
- accounting export/API;
- email/SMS;
- approved delivery/booking/CRM services;
- other explicit customer/provider requirements.

An adapter may:

- submit an operation;
- query provider state;
- receive signed/verified callbacks;
- map provider identifiers to GoSpots entities;
- reconcile external state with a GoSpots-owned aggregate;
- emit integration health/attention signals.

An adapter may not:

- become the canonical source for GuestChecks, sessions, orders, payments, inventory or other native domains;
- bypass GoSpots permissions/tenant boundaries;
- create a separate revenue total;
- turn provider timeout into assumed failure/success;
- require another POS for ordinary venue operation.

## 3. Provider-neutral platform contracts

The existing integration platform remains reusable:

- ConnectorInstallation;
- connector registry/capabilities;
- encrypted credentials/secrets;
- IntegrationJob durable queue;
- IntegrationMapping / external references;
- API credentials/scopes;
- inbound/outbound webhooks;
- retries, leases and dead-letter state;
- audit and correlation IDs.

Provider-specific behavior belongs behind the connector interface rather than inside checkout, inventory, reservations or other core modules.

## 4. Installation and tenant binding

Every connector installation must be bound to exactly the authorized tenant/venue context. A valid installation ID from another tenant is not sufficient authorization.

Secrets are:

- encrypted at rest when they must be recoverable;
- hash-only when verification does not require recovery;
- never logged or returned casually;
- rotated/revoked through an explicit lifecycle.

## 5. Idempotency and delivery

Retryable outbound operations require stable idempotency/dedupe identity.

Inbound callbacks require:

- provider/event identity;
- signature/authentication where supported;
- replay-window protection where appropriate;
- payload hash/conflict detection where an event ID is reused;
- consumer idempotency.

Outbound webhooks are treated as at-least-once delivery unless a stronger guarantee is explicitly implemented. Receivers must receive a stable event ID.

## 6. Failure and reconciliation

Each provider adapter must define:

- timeout behavior;
- provider unavailable behavior;
- retryable versus terminal errors;
- uncertain/UNKNOWN state if the operation cannot be safely classified;
- reconciliation/query path;
- dead-letter/operator recovery path;
- observability/health state.

A retry must not create a logically new payment/refund/fiscal submission when the original operation may already have succeeded.

## 7. Offline/Edge boundary

External provider availability must not silently become the venue's local operating authority.

When internet is unavailable:

- GoSpots core workflows follow `OFFLINE_STRATEGY.md`;
- provider calls follow the provider's certified offline capability, if any;
- a local queue distinguishes pending provider work from provider-confirmed success;
- reconciliation occurs after connectivity returns.

## 8. Adding a future connector

A provider-specific connector requires all of:

1. explicit product/customer requirement;
2. official supported API/protocol documentation;
3. tenant and permission design;
4. credential/secrets design;
5. provider capability matrix;
6. idempotency/retry/UNKNOWN semantics;
7. mapping/source-of-truth statement;
8. tests with deterministic simulator/mocks;
9. sandbox/demo proof where available;
10. real supported-environment proof when marketed behavior depends on it;
11. outage/recovery/reconciliation acceptance;
12. runbook and observability.

If these are not available, the connector stays absent or fail-closed and does not block standalone GoSpots.

## 9. Historical compatibility

Existing generic integration schema and jobs remain valid. Phase 0 removes provider-specific external-POS assumptions rather than deleting useful platform infrastructure.
