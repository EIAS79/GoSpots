# Phase 2 v2 venue model

This contract implements Phase 2, “Venue Setup, Floor, Resources, Rates and Devices,” from `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`. GoSpots owns this state; no POS or provider is authoritative for venue configuration.

## Canonical ownership

| Concern | Canonical record | Rule |
| --- | --- | --- |
| Business/receipt identity | `Shop` | Legal and display identity, address, locale, currency, timezone, business-day boundary, tax profile and receipt brand are venue-owned. |
| Multi-location branch | `OrganizationShop` | A branch has an organization-unique code and layered organization, inherited-location and explicit-override settings. Transactional tenant scope remains `Shop`. |
| Floor and zone | `GamingSection` | A zone has a type, floor, visibility and optimistic version. The historical name is retained to avoid a destructive parallel zone aggregate. |
| Physical resource | `Resource` | A venue-unique stable code identifies a resource. Persistent configuration is separate from computed live state. |
| Price rule | `OperationsRatePlan` | Integer minor units, explicit currency through the session, target ownership and schedule constraints are server authoritative. |
| Applied price | `OperationsSession.rateSnapshot` | The selected rule, price, rounding, schedule, membership evidence, party/game count and venue timezone are immutable for that session. |
| Catalog | `MenuItem` | Product/service kind, unit, tax key, SKU, barcode, price and active status are venue-owned. |
| Device | `Device` | Type, venue, station, claim, software version and last-seen state are provider-neutral. |

## Resource state

Persistent configuration is one of `ENABLED`, `MAINTENANCE`, `DISABLED`, or `OFFLINE_DEVICE`. The operations floor computes `AVAILABLE`, `RESERVED`, `OCCUPIED`, `PAUSED`, `MAINTENANCE`, `DISABLED`, or `OFFLINE_DEVICE` from configuration, open sessions, current reservations and maintenance periods. Clients never persist a computed state.

Disabled, maintenance and offline-device resources cannot start or receive a live session. Competing starts and moves use venue/resource advisory transaction locks; mutable configuration uses optimistic versions.

## Rate selection

Supported modes are hourly, per-minute, fixed price, fixed-duration, per-person, per-game and free. Rules can specify minimum duration and charge, rounding, grace, cap, overtime, weekday/window (including overnight), effective range, holiday dates, membership tier hook, happy hour, group package, category default, resource override and priority.

Selection uses the venue IANA timezone. A post-midnight portion of an overnight window belongs to the previous schedule day. Resource rules outrank category rules; then priority and creation order decide. Membership rules are selected only from a server-derived active customer membership linked through the GuestCheck identity. A request cannot assert membership status.

All authoritative values are integer minor units. Decimal legacy resource prices are converted with Prisma Decimal and half-up rounding; no floating-point result becomes financial authority.

## Authorization and tenancy

Every mutation requires its granular permission and the current subscription capability. Venue identity is taken from the authenticated token. Resource/rate/category/device/catalog and organization-location lookups include the authenticated shop or verified organization access set. Database uniqueness protects branch codes, resource codes, SKUs and barcodes under concurrent requests; rate targets additionally have same-shop foreign keys.

## Offline classification

Phase 2 configuration mutations, onboarding template application, device claim/unclaim and rate publication are `ONLINE_ONLY`. Cached floor/configuration display is `OFFLINE_READ_ONLY`. No Phase 2 setup mutation enters the Phase 3/12 offline operation queue. This prevents configuration, pricing, claim and membership conflicts from being silently merged.

## Events and integrations

Phase 2 introduces no provider-specific event consumer and no external source of truth. Existing durable audit is required for resource, rate, device, organization and setup mutations. Payment, fiscal and hardware adapters remain optional readiness steps and do not block an operational floor.
