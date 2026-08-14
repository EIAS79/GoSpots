# Phase 2 v2 acceptance record

Source: `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`, Phase 2 — Venue Setup, Floor, Resources, Rates and Devices.

Status: `READY_FOR_ACCEPTANCE` pending exact-head CI, merge, deployment and production Gate P2 drill.

## Requirement matrix

| Requirement | Repository evidence | Acceptance evidence |
| --- | --- | --- |
| Full venue profile | `Shop`, settings DTO/service and onboarding profile/regional steps | API/settings and 12-step browser drill |
| Multi-location-ready branches | `OrganizationShop.branchCode`, organization settings inheritance resolver/endpoints | uniqueness, inheritance and organization security tests |
| Floors and zones | versioned `GamingSection` zone type, floor and visibility | template creates an operational zone without SQL |
| Stable resources and computed state | `Resource.code`, configuration/version/layout; operations floor state computation | uniqueness/migration assertions and disabled-state tests |
| Complete rate modes/rules | `OperationsBillingMode`, versioned `OperationsRatePlan`, timezone resolver | unit boundaries, overnight, DST, membership, override and money tests |
| Immutable applied rates | expanded `OperationsSession` columns and `rateSnapshot` | start/finish API drill and snapshot tests |
| Product/service catalog | `MenuItem` kind/unit/tax/SKU/barcode and unique indexes; operator dialog | clean/upgrade migration and web checks |
| Device registry and claim | expanded device types, station/software/version/claim APIs and UI | tenant and concurrent-claim tests |
| Guided setup | server readiness plus 12-step operator wizard | Phase 2 Playwright smoke |
| Tenant/permission/capability/audit | scoped services, permission guards, feature checks, audit calls | negative tenant, permission and owner-capability tests |
| Operations and rollback | migration assertions and Phase 2 runbook | clean and representative-upgrade CI jobs |

## Gate P2

The gate is one fresh production venue configured from registration through profile, hours, floor/zone, resources, rate and a test operation, followed by a server readiness result of `operational=true`. The drill must not use manual database edits. Optional catalog, devices, payment and fiscal configuration are reported distinctly and do not replace the operational-floor requirements.

Final SHAs, CI run, deployment IDs, production smoke evidence and Gate P2 result are recorded here only after those actions complete.
