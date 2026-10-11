# 13 — Physical Venue Management: Maintenance, Cleaning, Checklists and Safety

**Classification:** `NEW_SCOPE_CANDIDATE`, proposed extension for complete Tier B venue operation | **Priority:** P2 unless a design partner explicitly needs it for safe operations.

## Gap vs master scope

P2/P3 describe resource maintenance/downtime but not a comprehensive management system for operating a physical site: preventive maintenance of billiard tables and cues, kitchen equipment service, cleaning tasks, inspections, accidents, keys and supplies, contractor schedules, utility alerts and asset replacement. There is no dedicated HACCP or temperature-log feature in the supplied master. Source documents do **not** establish whether pieces are already implemented elsewhere. This plan defines an optional native venue module so owners do not depend on paper checklists for daily physical control.

## Venue asset authority

Model `VenueAsset` with stable ID, type (billiard table, darts board, fridge, oven, KDS terminal, cash drawer, printer, fire/exit equipment only if maintained by qualified external provider), location, responsible employee, install date, service warranty, serial and supplier. Separate fixed asset valuation/depreciation (Tier C) from physical condition, tickets, and consumables. Add `MaintenanceTicket`, `WorkOrder`, `Inspection`, `CleaningChecklist`, `IncidentReport`, `OperatingPermitDocument` and `ServiceContract` with audit. No claim that software replaces legally required certified inspections.

## Subsystem plans

**Equipment upkeep:** preventive schedules per asset (e.g., billiard cloth wear, cushion checks, level adjustments, cue tip/cue cleaning, dartboard inspection, fridges, payment terminals), meter/hours-triggered maintenance tied to actual game hours, breakdown report, parts consumption via Plan 07, vendor contact, SLA and proof of completion. Maintenance must mark unavailable resources unavailable to book/start at Plan 05; repairs restore availability only after authorized sign-off.

**Opening and closing:** configurable checklist with role, required evidence, due time and escalation. Test safe/fiscal printer status, cash float, fire exit unlocked where applicable, kitchen cleaning/temperature tasks, table condition and lighting, locker/security status, staffed stations, closing cash reconciliation and device shutdown. A completed tick-box alone does not certify legal compliance; attach evidence, reviewer and revisions.

**Accidents/security incidents:** bounded incident categories (slips, broken equipment, lost property, customer dispute, emergency evacuation, break-in), attachment policies, time/location/staff, escalation, redaction, duty-of-care workflow and retention. Sensitive details get strict roles; do not store medical or criminal information unless a justified legal basis and necessary safeguards exist. Emergency response procedures should prioritize contacting appropriate human emergency services, not AI autonomous actions.

**Food safety extension:** link Plan 06 HACCP assistance to actual devices/stock; fridge temperature probe integration only after independent hardware validation, calibration and manual override audit. Supplier and contractor records reference Plan 07. Recurring checks and alerts should be local-time aware and survive outages without silently missing deadlines.

**Energy and cost:** optional meter readings for electricity, water and gas, tariffs, historical trend and alerts; clear 'not a utility billing authority' status. Improve owner profitability analysis without altering checkout records.

## Operator UI and flows

A staff 'Daily tasks' view with due/overdue/offline tasks; manager 'Site health' view grouping critical broken resources, inspections, supplier visits and recurring costs; owner cross-site trend. Device-assisted photo/scanner entry, responsive mobile support, accessible keyboard mode and multilingual instruction templates. Direct links from broken billiard table to blocked booking slot, from fridge alarm to affected inventory lots, from kitchen printer issue to outstanding KDS order. Keep high-risk controls behind appropriate staff approval.

## Acceptance tests

- A table is taken out of service mid-session: cannot accept new bookings, existing checked-in guests given permitted relocate/refund workflow.
- Maintenance contractor closes a ticket without permission: denied; manager authorizes.
- Opening checklist depends on fiscal printer and staff cash float; incomplete items visibly block or warn based on approved policy, not silently disappear.
- Temperature above range triggers task with correction and supervisor review, offline entry reconciles by event time and cannot falsely overwrite previous reading.
- Equipment service parts decrease stock only once; no duplicate charge or stock event on rerun.
- Venue exit exports assets/service records and retains customer financial artifacts separately.

## Release rule

Mark as **Tier B venue-operations module**, not P0/P17 release blocker unless marketing or customer contract promises it. Pilot in a real venue with staff, document known limits, privacy controls and service calendar integrity. Deliver `venue-assets-maintenance-schema.md`, `physical-site-task-catalog.md`, `incident-privacy-controls.md`, `facility-operator-pilot.md`.
