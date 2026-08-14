# GoSpots Canonical Domain Truth

This document freezes business meaning for the current repository without requiring destructive renames. Code may retain legacy model names while new work uses the canonical meanings below.

## 1. Organization, tenant, venue and branch

| Canonical term | Meaning | Current repository mapping |
| --- | --- | --- |
| **Organization** | One business group that may own/manage multiple operating locations. | Existing `Organization`, `OrganizationMembership`, `OrganizationShop` domain. |
| **Tenant** | Security/isolation boundary for operational data. | Today this is primarily the `Shop` and its `shopId`. |
| **Venue** | One physical operating location running GoSpots. | Current DB/API commonly calls this `Shop`. |
| **Branch** | Business-language synonym for a Venue when discussed inside a multi-location Organization. | No separate Branch model is required merely for naming consistency. |

Rules:

- `shopId` remains authoritative tenant scope until a later migration explicitly changes it.
- Organization membership never grants access to an unrelated tenant.
- A database rename is not a Phase 0 requirement.
- New documentation should prefer **Venue** for operator/product language and identify `Shop` where an implementation name matters.

## 2. Identity, staff and membership

| Canonical term | Meaning |
| --- | --- |
| **User** | Authentication identity: credentials, sessions, MFA/recovery and global account identity. |
| **Membership** | User-to-Venue relationship used for venue role/access scope. |
| **Staff/Employee** | Operational/employment profile and workforce facts. Staff is not itself an authentication authority. |
| **Role** | Coarse operational grouping. |
| **Permission** | Server-enforced authorization to perform an action. Role does not replace permission. |

## 3. Resource and session

| Canonical term | Meaning |
| --- | --- |
| **Resource** | A playable, rentable, occupiable or service unit such as billiard table, gaming station or private room. |
| **Session** | Timed usage history for a resource. It owns time/usage facts, not payment truth. |
| **Reservation** | Future capacity commitment. It may later create/attach a session/check but remains a distinct lifecycle. |
| **WaitlistEntry** | Queue/capacity request, not a reservation until explicitly converted. |

Live resource state may be a projection of persistent resource configuration plus active sessions/reservations/device state. Do not store competing authoritative occupancy facts casually.

## 4. Commercial and financial terms

| Canonical term | Meaning | Current repository examples |
| --- | --- | --- |
| **GuestCheck** | Customer's running commercial obligation/open check. | `GuestCheck` |
| **Order / OrderItem** | Requested product/service fulfillment facts. | Ordering/shop-order domains |
| **ChargeSnapshot** | Immutable applied charge/price source captured for settlement. | `ChargeSnapshot` |
| **Settlement** | Authoritative calculated allocation of what is due for a check at a version in time. | `CheckSettlement` |
| **Payment** | Attempt/outcome of satisfying a settlement amount using a tender/provider. | Checkout/device-payment `Payment` domain |
| **Refund** | New reversing/return financial fact tied to prior payment/settlement; never deletion of the original. | Refund/payment reversal records as implemented |
| **Ledger** | Durable financial trail used for reconciliation/reporting authority. | `LedgerEntry` |
| **CashShift / CashSession** | Drawer/operator cash-accountability lifecycle. | Existing cash domain uses `CashSession`, drawers, movements, counts. |

### Bill versus GuestCheck

Use **GuestCheck** for the live/open commercial obligation. “Bill” is presentation language only and must not become another authoritative model.

### Settlement versus Payment

A **Settlement** calculates/records what is due and how commercial charges are allocated. A **Payment** is a tender/provider fact. A settlement can exist before successful payment and can be partially paid.

## 5. Invoice, fiscal document and KSeF

| Term | Meaning |
| --- | --- |
| **Invoice** | Issued legal/commercial invoice snapshot. It must not be rewritten by later catalog changes. |
| **FiscalDocument** | Fiscalization/receipt record and device/provider outcome. It is separate from payment success. |
| **KSeF submission** | Transport/compliance lifecycle for sending a structured invoice to KSeF. It does not own the underlying sale. |

A fiscal or KSeF transport failure must not invent a second sale or incorrectly mark a successfully paid check unpaid.

## 6. Inventory

| Term | Meaning |
| --- | --- |
| **Stock item** | Inventory-tracked physical item. |
| **Stock movement** | Canonical explanation for inventory change. |
| **Recipe/BOM** | Consumption rule connecting sold/produced items to stock. |
| **Stocktake** | Count boundary and resulting audited adjustment, not silent quantity replacement. |

## 7. Customers and value

- **Customer** owns customer identity/profile and consent-scoped relationship data.
- **Membership** owns a customer's plan/entitlement lifecycle; do not confuse with staff venue membership.
- **Loyalty** and **stored value** require dedicated ledgers; mutable balances alone are not authoritative.

## 8. Devices, Edge and offline

- **Device** identifies registered venue hardware/software endpoint.
- **Edge Hub** is GoSpots' venue continuity component; it is not a third-party system of record.
- **Offline command/outbox record** owns durable replay identity, payload hash, sequence/version and reconciliation state.

## 9. Audit and events

- **AuditLog** answers who changed what, where, when, why and from which context/device where available.
- **DomainEventOutbox** carries versioned durable domain events. Events are transport/integration facts, not alternative aggregate storage.

## 10. Naming change rule

When new work encounters an older name:

1. identify its canonical meaning here;
2. do not add a second model merely to obtain a nicer name;
3. rename schema/API only through a migration/compatibility plan when the benefit justifies it;
4. keep product-facing language consistent even if internal compatibility names remain;
5. update this document before intentionally changing a canonical meaning.
