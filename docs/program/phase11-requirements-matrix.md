# Phase 11 Requirements Matrix — Ticketing, QR/RFID, Access, Occupancy and Lockers

Source: GoSpots Master Product & Engineering Execution Plan v2 — Phase 11.

| Requirement | Implementation | Verification |
|---|---|---|
| Ticket is access fulfillment, not a payment authority | `TicketProduct.menuItemId` links to canonical `MenuItem`; `TicketOrder` fulfillment requires PAID/CLOSED `CheckSettlement`; new orders have no independent total | ticketing service tests + Phase 11 CI |
| Secure QR ticket | 192-bit random raw token; HMAC stored; raw token returned once; shared idempotency receipt strips secrets | service/controller design + API build/tests |
| Expiry, redeem, cancel, reissue | ticket/access credential status + scan limit + optimistic version; cancel revokes credential; reissue revokes old token and retains lineage | focused service tests |
| Access zones | `AccessZone` with optional capacity and active/version state | clean/upgrade migrations + persisted assertions |
| Access rules | priority rules over ticket product, membership tier, date/time and visit count | service logic + type/build gate |
| Scanner assignment | existing `Device(type=ACCESS_SCANNER)` + `AccessScannerConfiguration` zone/cache/sequence policy | wrong-zone/offline-policy tests + unique sequence DB assertion |
| RFID/NFC/wristband | `AccessCredential` hashes token and requires traceable customer/membership/stored-value fact | service tests |
| RFID stored value | loads/spends delegate to Phase 9 `StoredValueAccount` / `StoredValueLedgerEntry`; legacy RFID wallet tables have no mutation endpoints | canonical-ledger delegation test |
| Occupancy | derived from append-only `AccessEvent.occupancyDelta` | persisted occupancy assertion |
| Missing exit / correction | audited `CORRECTION` event with reason, previous and target occupancy | focused test + operator UI |
| Capacity exceeded | access service denies ENTER at zone capacity | access service logic |
| Device offline | scanner cache permission is explicit; offline replay requires configured policy and ordered device sequence; full offline authority deferred to Phase 12 | offline replay test; UI warning |
| Lockers | locker availability, assignment, credential, optional paid rental/deposit lineage, open/close events | DB unique active assignment + operator UI |
| Locker manual override | reason required, immutable event and audit record | focused test + operator UI |
| Tenant isolation | server derives shop from JWT; same-tenant zone/rule/locker FKs; all canonical reference lookups use shop scope | cross-tenant DB assertion + unknown credential test |
| Idempotency/concurrency | shared `IdempotencyReceipt`; advisory locks on ticket fulfillment, ticket mutation, access zone and locker; DB uniqueness backstops scanner sequence/locker occupancy | service tests + persisted assertions |
| Domain events | Phase 11 mutations enqueue versioned `schemaVersion: 1` outbox events | API build + source audit |
| Operator workflow | `/dashboard/[venuePath]/access` workspace for ticket fulfillment, zones, scanner config, credentials, scans, occupancy and lockers | web typecheck/build |
| Clean migration | full migration chain into PostgreSQL 17 | Phase 11 workflow |
| Representative upgrade | pre-Phase-11 legacy ticket order/product/RFID wallet/credential survives unchanged; no fabricated canonical lineage | `phase11-upgrade-fixture.ts` / `phase11-upgrade-assert.ts` |

## Stop boundary

Phase 12 offline-first/Edge authority is not implemented here. Phase 11 only defines scanner credential-cache/replay policy and ordered access-event ingestion required by its own acceptance criteria.
