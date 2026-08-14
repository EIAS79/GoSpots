# Phase 2 v2 — Venue Setup Acceptance Record

Source: `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`, Phase 2 — Venue Setup, Floor, Resources, Rates and Devices.

Status: `ACCEPTED`.

Software and operational acceptance evidence:

- implementation PR `#45` merged with expected head `f42b01bff4679ecba38fa8e30c80d6d0a8fb13fa`;
- merged implementation revision `08558f1db815a781b7deda9c92d07e4650b6975f`;
- exact-head PR CI run `31789767027` (#514): all six required jobs passed;
- standalone-boundary run `31789767102` (#24): passed on the exact PR head;
- post-merge main CI run `31790115049` (#515): all six required jobs passed;
- post-merge standalone-boundary run `31790115008` (#25): passed;
- Render deployment `dep-d9vec65bedkc7383540g` checked out the merged revision, ran `prisma migrate deploy`, started the Nest application and became live;
- Vercel production deployment `dpl_4MkF8PvS6fDnHC4mHEub51zFnB7w` is `READY` on the merged revision and owns the production aliases;
- Neon migration `20260814150000_phase2_venue_setup_v2` finished at `2026-08-14T09:57:49.786Z` without rollback;
- production `/api/v1/ready` returned HTTP 200 with `database: up`, and the production homepage returned HTTP 200;
- Vercel reported no runtime-error clusters after deployment and the Gate P2 drill;
- Render logs show the complete Gate P2 request sequence with successful registration, profile update, template application/replay, catalog read, session start/finish and readiness read. No unexpected runtime error followed the drill.

## Requirement matrix

| Requirement | Reconciliation | Repository evidence | Acceptance evidence |
| --- | --- | --- | --- |
| Full venue profile | `EXISTING_NEEDS_CHANGE` → implemented | `Shop`, settings DTO/service and onboarding profile/regional steps | authenticated API/settings drill and 12-step browser acceptance |
| Multi-location-ready branches | `PARTIALLY_IMPLEMENTED` → implemented | `OrganizationShop.branchCode`, organization settings inheritance resolver/endpoints | uniqueness, inheritance and organization security tests |
| Floors and zones | `EXISTING_NEEDS_CHANGE` → implemented | versioned `GamingSection` zone type, floor and visibility | production template created three operational zones without SQL |
| Stable resources and computed state | `EXISTING_NEEDS_CHANGE` → implemented | `Resource.code`, configuration/version/layout; operations floor state computation | uniqueness/migration assertions, disabled-state tests and six production resources |
| Complete rate modes/rules | `PARTIALLY_IMPLEMENTED` → implemented | `OperationsBillingMode`, versioned `OperationsRatePlan`, timezone resolver | unit boundaries, overnight, DST, membership, override and integer-money tests |
| Immutable applied rates | `PARTIALLY_IMPLEMENTED` → implemented | expanded `OperationsSession` columns and `rateSnapshot` | production start/finish drill plus canonical Neon snapshot assertion |
| Product/service catalog | `PARTIALLY_IMPLEMENTED` → implemented | `MenuItem` kind/unit/tax/SKU/barcode and unique indexes; operator dialog | clean/upgrade migration and web checks |
| Device registry and claim | `PARTIALLY_IMPLEMENTED` → implemented | expanded device types, station/software/version/claim APIs and UI | tenant and concurrent-claim tests |
| Guided setup | `MISSING` → implemented | server readiness plus 12-step operator wizard | permanent Phase 2 Playwright smoke and production readiness result |
| Tenant/permission/capability/audit | `EXISTING_NEEDS_CHANGE` → implemented | scoped services, permission guards, feature checks, audit calls | negative tenant, permission and owner-capability tests; zero production cross-tenant links |
| Operations and rollback | `MISSING` → implemented | migration assertions and Phase 2 runbook | clean and representative-upgrade CI jobs plus production migration evidence |

## Database and migration evidence

`20260814150000_phase2_venue_setup_v2` is an expand-first migration. It preserves historical resources, backfills deterministic stable codes and rate fields, adds positive version/layout/rate checks, and validates same-tenant rate-target foreign keys.

- clean PostgreSQL 17 migration and `phase2-venue-assert.ts`: passed;
- representative historical-data upgrade and preservation assertions: passed;
- Prisma generate, validate and migrate status: passed in both CI migration paths;
- production: all 9 Phase 2 constraints are present and validated;
- production: all 7 required uniqueness/index contracts are present;
- production: resource/category, resource/zone, rate/resource, rate/category and session/resource cross-tenant violations are all zero;
- production: invalid resource layout/version and negative rate-money invariant counts are zero.

## Test evidence

- API: 70 suites / 315 tests, plus production build;
- rate/money: every billing mode, exact integer-minor-unit calculations, rounding, grace, minimum/cap, fixed duration, per-person, per-game and free rules;
- schedule selection: weekday, holiday, overnight, DST, effective windows, priority and resource/category override;
- security: cross-tenant resources, categories, zones, devices and organization settings; permission and capability denials;
- integrity: optimistic versions, concurrent device claim, resource uniqueness, disabled-resource session denial and deterministic idempotency replay/conflict;
- database: clean migration and representative historical upgrade;
- web: i18n contract, 20 checkout tests, 10 Offline Lite tests, typecheck and production build;
- Edge Hub: 20 tests and production build;
- browser: 13 permanent E2E cases, including a new empty venue reaching operational readiness without database edits;
- performance: rate resolution, setup and readiness executed against representative fixtures and the production drill; no Phase 2-specific load threshold is defined by the source.

## Gate P2

The gate required one fresh production venue configured from registration through profile, hours, floor/zone, resources, rates and a test operation, followed by a server readiness result of `operational=true`, without manual database edits.

Production Gate P2 result:

- venue path: `p2-acceptance-1786701742662-debea4`;
- shop: `cmsss382f000sf01ybjd3nspj`, profile version 2, `Europe/Warsaw`, business-day start 04:00;
- template: `mixed_activity`, 3 categories; replay with the same idempotency key returned the same result in 1 ms;
- operational floor: 3 zones, 6 resources and 3 active rates;
- test operation: session `cmsss3anh002sf01y5qc7h3ya` started and finished successfully on resource `cmsss39bu001nf01yo8yboy52`;
- canonical data: the finished session is tenant-bound and contains an object-valued immutable rate snapshot;
- server readiness: 12 steps, `operational=true`, test-session count 1;
- manual database changes: none. Neon was used only for read-only post-operation assertions.

The first smoke request attempted a currency change without the mandatory preview/confirmation and received the expected HTTP 400 safety response. The successful gate run kept the registered currency unchanged; this was a validation proof, not an application failure.

Catalog products, device claims, payment providers, fiscal devices and KSeF are optional later-phase capabilities and are not external acceptance gates for Phase 2.

Gate P2: `PASS`. Phase 2 is `ACCEPTED` on the merged implementation revision `08558f1db815a781b7deda9c92d07e4650b6975f`.
