# Checkout command-center redesign

This change reorganizes Checkout around the cashier/operator's real sequence without changing canonical money authority.

## Primary workspace

1. Find or create a guest check.
2. Attach/finalize activity and review the current bill.
3. Take payment once through the selected authoritative tender.
4. Resolve compliance/activity blockers and close the check.

## UX decisions

- Open checks become a searchable, persistent work queue.
- The selected check gets a compact operator header instead of repeating large explanatory panels.
- Commercial context, discounts, comps, service charge, gratuity and transfer controls move behind **Advanced bill controls** so they remain available without dominating every checkout.
- Amount due is the primary visual in the payment rail; subtotal/tax/deposit details are available in a compact bill-breakdown disclosure.
- Payment methods use descriptive cards with icons and clear authority semantics.
- Provider payment recovery, paid-but-live activity, fiscal/compliance state and refunds remain separate explicit states.
- Payment history/refunds are grouped under a dedicated disclosure after a settlement exists.

No checkout financial authority, settlement semantics, Adyen behavior, or fiscal semantics are changed by this UI-only redesign.
