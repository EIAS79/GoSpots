# 06 — Hospitality Operations, Kitchen Reliability, Allergen and Food-Safety Controls

**Classification:** P6 and P7 `COVERED_VERIFY_DEPTH`; food safety/HACCP audit tooling `NEW_SCOPE_CANDIDATE` | **Priority:** P0 for advertised restaurant/KDS/fiscal printing, P1/P2 for food-safety software depending on scope.

## Existing coverage versus identified gaps

P6 already specifies menu/modifiers, orders, tables/seats, bar tabs, coursing, KDS, printers, 86-out, takeout, QR, kiosk and display. P7 already specifies recipes, suppliers, movements and waste. R5/R7/R11 mandate re-certification and physical printer/KDS/QR flows. **Do not label menu/KDS nonexistent.** The master mentions allergens but does not define a full restaurant allergen propagation/food-safety acceptance matrix; original P/R sections have no explicit HACCP, temperature logs, cleaning evidence or recall process. Those are **new product-depth candidates**, not proof every restaurant must use GoSpots for compliance documentation.

Official context: Polish GIS states food businesses need hygiene systems based on HACCP principles and good practice appropriate to their operation, and inspectors review raw materials, labeling, traceability, sanitation and staff practices. Food information/allergens fall under EU Regulation 1169/2011, with national implementing details. See [GIS HACCP](https://www.gov.pl/web/gis/wymagania-higieniczne--system-haccp), [GIS inspections](https://www.gov.pl/web/gis/kontrola-zywnosci-w-punktach-gastronomicznych), [EU food information](https://eur-lex.europa.eu/eli/reg/2011/1169/2014-02-19/eng).

## A. Order authority and operational safety

Every customer-facing item uses one catalog/versioned SKU, choice modifiers and correct tax/price snapshot. Model `DRAFT → SENT_TO_PRODUCTION → ACCEPTED → PREPARING → READY → SERVED / CANCELED` with permissioned transition and meaningful delay escalation. KDS tickets/outbound kitchen prints must originate from durable outbox job IDs to ensure restart replays safely; kitchen printer reprint labeled `COPY`, not a second order. GuestCheck records remain independent from preparation state, and comps/returns do not delete completed production/waste movements. Include dine-in with seats/courses, bar open tab, takeaway, quick counter, split bill, staff device transfer, printer substitute, QR order auth + anti-CSRF/rate limits.

## B. Menu, allergens and dietary warnings

Define a maintained allergen master and ingredient/recipe mapping; compute the menu allergen profile from base item plus modifier substitution/addition, not just manually entered banner. Staff changes to ingredients must invalidate affected published menu/allergen review. Public QR menu, cashier ordering, printed/menu export and kitchen ticket must agree on the reviewed labels. Distinguish verified allergen presence, possible cross-contact advisory and `UNKNOWN_REQUIRES_CONFIRMATION`; never claim a dish allergen-free based on missing data. Require owner/food-responsible staff approval before publishing material changes; store review version and audit. **Software cannot guarantee food is safe if kitchens do not follow procedures.**

## C. Operational HACCP-assistance, not fake certification

Optional configurable temperature reading tasks for fridge/freezer/hot-hold units with equipment ID, range, unit, shift/date, operator, device/source and corrective actions; cleaning/sanitization task templates with photographic/typed evidence, completed time, manager countersign; incoming goods batch/expiry and food rejection; pest-control and maintenance reminders; supplier traceability; equipment calibration checks; batch recall exposure query linking lots to recipes/sales where physically achievable. Retain revisions; make overdue/out-of-range events highly visible. State **assists** HACCP/GHP/GMP, does not issue legal safety certification or replace competent staff inspection.

## D. Food cost and production reconciliation

Link accepted production action to ingredient consumption reservation or stock movement, configurable production-vs-sale policy, modifiers, recipe portions, yield, waste, void after cooking, complimentary items, split portions and negative stock alerts. Prevent double consumption on duplicated kitchen webhook/reprint. If restaurant does not enable ingredient-level stock, transparently downgrade stock valuation reports rather than invent quantity accuracy.

## Required physical and browser matrix

- Two cooks and two waiters process duplicate, out-of-order and interrupted print commands, cold-start KDS, printer jam and reconnect with zero lost/duplicate prep tickets.
- Customer replaces milk with another ingredient: allergen labels recalculate or require food manager review.
- QR order rejected if token belongs to wrong table/closed session; expired/forged link cannot create charge.
- Void after food prepared adjusts ledger and writes correct waste/stock event.
- Two orders deplete last unit; 86-out enforced at server in correct capacity mode.
- Temperature out of range generates shift task and corrective-action history; readings cannot be falsified by a different tenant.
- Lot recall produces list of affected receipt/ingredient consumption where traceability exists, with explicit uncertainty if end-customer trace is unavailable.

## Exit and rollout contract

Restaurant feature marketed only after real KDS/printer and cashier tests. Add food-safety software as supported feature pack, not a silent mandatory legal claim. Evidence: `kds-printer-fault-certification.md`, `menu-allergen-information-matrix.md`, `food-safety-feature-scope-and-haccp-disclaimer.md`, recipe/conservation logs. Signoff by venue chef/food operations owner, a qualified local adviser for any compliance claims, and finance owner for stock tax/cost implications.
