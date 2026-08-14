# GoSpots Product Contract

**Program source:** GoSpots Master Product & Engineering Execution Plan v2  
**Phase:** 0 — Baseline Audit + Standalone Architecture Reset

## 1. Product identity

GoSpots is an independent venue operating system for billiard, gaming, restaurant, bar, café and mixed entertainment venues.

A venue must be able to operate its GoSpots-owned workflows without another POS product being present. External services may supply a capability, but they do not own GoSpots business state.

## 2. Native GoSpots domains

The following are native product domains and must remain under GoSpots authority:

- organization/tenant and venue configuration;
- resources and live resource state;
- timed sessions;
- GuestChecks/open commercial checks;
- orders and order items;
- checkout and settlements;
- payments and refunds;
- financial ledger;
- cash shifts/movements/counts;
- invoices and fiscal-document state;
- reservations, deposits and waitlist;
- kitchen/KDS production state;
- inventory, recipes, purchasing and stock movements;
- customers, memberships, loyalty and stored value;
- workforce, permissions and approvals;
- tickets/access credentials;
- devices and Edge continuity;
- analytics/reconciliation projections;
- audit evidence and durable domain events.

No adapter may replace one of these domains with a provider-owned source of truth.

## 3. Optional external capabilities

Provider adapters may be used for capabilities such as:

- card acquiring/payment processing;
- payment terminals;
- Polish KSeF transport;
- fiscal printer/provider transport;
- accounting export/API;
- email/SMS;
- approved booking/delivery/CRM integrations;
- other explicitly justified provider services.

Each adapter must be optional to the core product except where the venue intentionally enables a legally or operationally required external rail. Provider outage must have an explicit failure/reconciliation policy.

## 4. Operational principles

1. **The live floor is operationally central.** A cashier must quickly see occupied, available, reserved, delayed and attention-required work.
2. **GuestCheck is the commercial spine.** Timed usage, food, services and merchandise converge into one commercial obligation where applicable.
3. **Financial truth is singular.** Settlement, payment/refund and ledger facts cannot be independently recreated by reports, integrations or offline queues.
4. **Failure is a normal operating condition.** Duplicate clicks, retries, browser refresh, device restart, internet loss, provider timeout and reconnect are designed states.
5. **Advanced features cannot weaken integrity.** Automation, AI, loyalty and integrations remain downstream of money, tenancy, permissions, audit, idempotency and reconciliation.

## 5. Venue packs

The application may expose different workflows by venue pack without forking the core product:

- billiard / pool / snooker;
- gaming lounge / console / PC;
- restaurant / café / bar;
- mixed entertainment venue.

A mixed venue must be able to use time-based activity and food/beverage operations in the same GoSpots commercial model.

## 6. Non-negotiable product boundaries

GoSpots must not introduce:

- another POS as an operational prerequisite;
- provider-specific logic inside the canonical checkout domain;
- a second authoritative revenue total;
- client-only authorization or feature enforcement;
- client-trusted tenant identity;
- mutable deletion of financial history to represent refunds/corrections;
- accidental offline capability without a certified policy;
- durable business events without a versioned contract.

## 7. Current database naming versus product language

The existing repository uses `Shop` as the primary venue/tenant model and `shopId` as the dominant tenant-scoping key. The product contract uses **Venue** for the physical operating location and **Tenant** for the isolation boundary. This is a semantic contract; Phase 0 does not require a destructive database rename.

Multi-location grouping is represented by the existing Organization domain. A venue may be described commercially as a branch when it belongs to an organization; that does not imply a separate Branch table is required.

Detailed terminology is frozen in `docs/architecture/DOMAIN_TRUTH.md`.

## 8. Supersession policy

Older chunk/phase documents remain historical evidence. If an older document conflicts with this contract or the Master Product & Engineering Execution Plan v2, the v2 contract wins. Historical implementation is reused when technically correct; historical product assumptions are not preserved merely because code or documentation once referenced them.
